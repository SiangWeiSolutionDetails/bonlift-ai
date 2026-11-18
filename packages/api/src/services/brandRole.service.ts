import {
  BRAND_ACTIONS,
  BrandParamsSchema,
  BrandRoleParamsSchema,
  CreateRoleBodySchema,
  PERSONAL_DATA_ACTIONS,
  providerBrandActions,
  UpdateRoleBodySchema,
  type BrandAction,
  type CreateRoleBodySchemaType,
  type RoleAssignmentRecordSchemaType,
  type RoleRecordSchemaType,
  type UpdateRoleBodySchemaType,
} from "@bonlift-ai/contracts";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors.js";
import { isForeignKeyViolation } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";
import type { RequestAccess } from "./authorization.service.js";
import { assertActionsOfKind, mapAssignmentRow, mapRoleRow, replacePermissions, toRoleError } from "./role.service.js";
import type { Queryable } from "./session.service.js";

interface BrandRoleFlags {
  brand_found: boolean;
  found: boolean;
  builtin: boolean;
  actor_holds: boolean;
  current_subset: boolean;
}

const PROVIDER_GRANT_LIMIT = BRAND_ACTIONS.filter((action) => !PERSONAL_DATA_ACTIONS.includes(action));

// $1 is the brand; brand roles are owned by its tenant.
const BRAND_CTE = `
  brand AS (
    SELECT b.id, b.tenant_id
    FROM brands b
    JOIN tenants tn ON tn.id = b.tenant_id AND tn.deleted_at IS NULL
    WHERE b.id = $1 AND b.deleted_at IS NULL
  )`;

const brandAssignmentCountOf = (alias: string) =>
  `(SELECT count(*) FROM user_brand_roles ubr WHERE ubr.role_id = ${alias}.id)`;

const actionsOf = (alias: string) =>
  `COALESCE((SELECT array_agg(rp.action) FROM role_permissions rp WHERE rp.role_id = ${alias}.id), '{}')`;

// Another tenant's role reads as missing. A brand role's assignments all sit on its own tenant's brands.
const targetCte = (actorParam: string, limitParam: string) => `
  target AS (
    SELECT r.id, r.is_builtin,
           EXISTS (SELECT 1 FROM user_brand_roles ubr WHERE ubr.user_id = ${actorParam} AND ubr.role_id = r.id) AS actor_holds,
           NOT EXISTS (
             SELECT action FROM role_permissions WHERE role_id = r.id
             EXCEPT SELECT unnest(${limitParam}::text[])
           ) AS current_subset
    FROM roles r
    JOIN brand b ON b.tenant_id = r.tenant_id
    WHERE r.id = $2 AND r.kind = 'brand'
  )`;

const GUARDS_PASS = `NOT t.is_builtin AND NOT t.actor_holds AND t.current_subset`;

const FLAG_COLUMNS = `
    b.id IS NOT NULL AS brand_found,
    t.id IS NOT NULL AS found,
    COALESCE(t.is_builtin, false) AS builtin,
    COALESCE(t.actor_holds, false) AS actor_holds,
    COALESCE(t.current_subset, false) AS current_subset`;

const LIST_BRAND_ROLES_SQL = `
  WITH ${BRAND_CTE}
  SELECT r.id, r.name, r.kind, r.is_builtin, ${actionsOf("r")} AS actions,
         ${brandAssignmentCountOf("r")} AS assignment_count
  FROM brand b
  LEFT JOIN roles r ON r.tenant_id = b.tenant_id AND r.kind = 'brand'
  ORDER BY r.name, r.id`;

// $1 brand, $2 name, $3 actions.
const CREATE_BRAND_ROLE_SQL = `
  WITH ${BRAND_CTE},
  role AS (
    INSERT INTO roles (name, kind, tenant_id)
    SELECT $2::text, 'brand', b.tenant_id FROM brand b
    RETURNING id, name, kind, is_builtin
  ),
  permissions AS (
    INSERT INTO role_permissions (role_id, action)
    SELECT role.id, a.action FROM role CROSS JOIN unnest($3::text[]) AS a(action)
  )
  SELECT b.id IS NOT NULL AS brand_found, ro.id, ro.name, ro.kind, ro.is_builtin
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN brand b ON true
  LEFT JOIN role ro ON true`;

// $1 brand, $2 role, $3 actor, $4 name, $5 the actor's grant limit, $6 the new actions.
function updateBrandRoleSql(replacesActions: boolean): string {
  return `
    WITH ${BRAND_CTE},
    ${targetCte("$3", "$5")},
    updated AS (
      UPDATE roles r
      SET name = COALESCE($4::text, r.name), updated_at = now()
      FROM target t
      WHERE r.id = t.id AND ${GUARDS_PASS}
      RETURNING r.id, r.name, r.kind, r.is_builtin
    )${replacesActions ? replacePermissions("$6") : ""}
    SELECT ${FLAG_COLUMNS},
      u.id, u.name, u.kind, u.is_builtin,
      ${actionsOf("u")} AS current_actions,
      ${brandAssignmentCountOf("u")} AS assignment_count
    FROM (VALUES (1)) AS one (x)
    LEFT JOIN brand b ON true
    LEFT JOIN target t ON true
    LEFT JOIN updated u ON true`;
}

// $1 brand, $2 role, $3 actor, $4 the actor's grant limit.
const DELETE_BRAND_ROLE_SQL = `
  WITH ${BRAND_CTE},
  ${targetCte("$3", "$4")},
  deleted AS (
    DELETE FROM roles r
    USING target t
    WHERE r.id = t.id AND ${GUARDS_PASS}
  )
  SELECT ${FLAG_COLUMNS}
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN brand b ON true
  LEFT JOIN target t ON true`;

// One row per holder per live brand; a role with no holders still returns one row with a null user_id.
const BRAND_ROLE_ASSIGNMENTS_SQL = `
  WITH ${BRAND_CTE},
  role AS (
    SELECT r.id
    FROM roles r
    JOIN brand b ON b.tenant_id = r.tenant_id
    WHERE r.id = $2 AND r.kind = 'brand'
  ),
  holders AS (
    SELECT u.id AS user_id, u.email, u.display_name, u.status,
           hb.id AS brand_id, hb.name AS brand_name, tn.name AS tenant_name
    FROM role
    JOIN user_brand_roles ubr ON ubr.role_id = role.id
    JOIN users u ON u.id = ubr.user_id
    JOIN brands hb ON hb.id = ubr.brand_id AND hb.deleted_at IS NULL
    JOIN tenants tn ON tn.id = hb.tenant_id
  )
  SELECT EXISTS (SELECT 1 FROM role) AS found, h.*
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN holders h ON true
  ORDER BY h.email, h.brand_name`;

const managesAsProvider = (actor: RequestAccess) =>
  providerBrandActions(actor.consoleActions).includes("brandRoles.manage");

// Provider support may grant everything but personal data; a brand role adds its own actions on top.
export function brandRoleGrantLimit(actor: RequestAccess, actorBrandActions: BrandAction[] | null): BrandAction[] {
  const viaProvider = managesAsProvider(actor) ? PROVIDER_GRANT_LIMIT : [];
  return [...new Set([...viaProvider, ...(actorBrandActions ?? [])])];
}

function assertWithinLimit(limit: readonly BrandAction[], actions: readonly string[]): void {
  const allowed = new Set<string>(limit);
  if (actions.some((action) => !allowed.has(action))) {
    throw new ForbiddenError("A brand role can only hold actions you may grant on this brand.");
  }
}

function assertBrandRoleGuards(flags: BrandRoleFlags): void {
  if (!flags.brand_found) throw new NotFoundError("Brand does not exist.");
  if (!flags.found) throw new NotFoundError("Role does not exist.");
  if (flags.builtin) throw new ForbiddenError("A built-in role cannot be changed.");
  if (flags.actor_holds) throw new ForbiddenError("You cannot change a role you hold.");
  if (!flags.current_subset) throw new ForbiddenError("The role holds actions you may not grant on this brand.");
}

function assertMayViewHolders(actor: RequestAccess, actorBrandActions: BrandAction[] | null): void {
  const held = new Set<string>([...(actorBrandActions ?? []), ...providerBrandActions(actor.consoleActions)]);
  if (!held.has("brandUsers.view")) throw new ForbiddenError("You cannot view this brand's users.");
}

export async function listBrandRoles(db: Queryable, brandId: string): Promise<RoleRecordSchemaType[]> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await db.query(LIST_BRAND_ROLES_SQL, [brandId]);
  if (result.rows.length === 0) throw new NotFoundError("Brand does not exist.");
  return result.rows.filter((row) => row.id).map((row) => mapRoleRow(row, row.actions));
}

export async function createBrandRole(
  db: Queryable,
  actor: RequestAccess,
  actorBrandActions: BrandAction[] | null,
  brandId: string,
  body: CreateRoleBodySchemaType,
): Promise<RoleRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(CreateRoleBodySchema, body);
  assertActionsOfKind("brand", body.actions);
  assertWithinLimit(brandRoleGrantLimit(actor, actorBrandActions), body.actions);

  try {
    const result = await db.query(CREATE_BRAND_ROLE_SQL, [brandId, body.name, body.actions]);
    const row = result.rows[0];
    if (!row.brand_found || !row.id) throw new NotFoundError("Brand does not exist.");
    return mapRoleRow(row, body.actions);
  } catch (error) {
    throw toRoleError(error, body.name) ?? error;
  }
}

function updateParams(
  brandId: string,
  roleId: string,
  actor: RequestAccess,
  limit: BrandAction[],
  body: UpdateRoleBodySchemaType,
): unknown[] {
  const params: unknown[] = [brandId, roleId, actor.user.id, body.name ?? null, limit];
  return body.actions === undefined ? params : [...params, body.actions];
}

export async function updateBrandRole(
  db: Queryable,
  actor: RequestAccess,
  actorBrandActions: BrandAction[] | null,
  brandId: string,
  roleId: string,
  body: UpdateRoleBodySchemaType,
): Promise<RoleRecordSchemaType> {
  assertValid(BrandRoleParamsSchema, { brandId, roleId });
  assertValid(UpdateRoleBodySchema, body);
  assertActionsOfKind("brand", body.actions ?? []);
  const limit = brandRoleGrantLimit(actor, actorBrandActions);
  assertWithinLimit(limit, body.actions ?? []);

  try {
    const result = await db.query(
      updateBrandRoleSql(body.actions !== undefined),
      updateParams(brandId, roleId, actor, limit, body),
    );
    const row = result.rows[0];
    assertBrandRoleGuards(row);
    if (!row.id) throw new NotFoundError("Role does not exist.");
    return mapRoleRow(row, body.actions ?? row.current_actions);
  } catch (error) {
    throw toRoleError(error, body.name) ?? error;
  }
}

export async function deleteBrandRole(
  db: Queryable,
  actor: RequestAccess,
  actorBrandActions: BrandAction[] | null,
  brandId: string,
  roleId: string,
): Promise<void> {
  assertValid(BrandRoleParamsSchema, { brandId, roleId });
  const limit = brandRoleGrantLimit(actor, actorBrandActions);

  try {
    const result = await db.query(DELETE_BRAND_ROLE_SQL, [brandId, roleId, actor.user.id, limit]);
    assertBrandRoleGuards(result.rows[0]);
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new ConflictError("Role is in use.");
    throw error;
  }
}

export async function listBrandRoleAssignments(
  db: Queryable,
  actor: RequestAccess,
  actorBrandActions: BrandAction[] | null,
  brandId: string,
  roleId: string,
): Promise<RoleAssignmentRecordSchemaType[]> {
  assertValid(BrandRoleParamsSchema, { brandId, roleId });
  assertMayViewHolders(actor, actorBrandActions);

  const result = await db.query(BRAND_ROLE_ASSIGNMENTS_SQL, [brandId, roleId]);
  if (!result.rows[0].found) throw new NotFoundError("Role does not exist.");
  return result.rows.filter((row) => row.user_id !== null).map(mapAssignmentRow);
}
