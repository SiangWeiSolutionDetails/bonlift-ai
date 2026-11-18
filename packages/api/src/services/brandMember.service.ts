import {
  AddBrandMemberBodySchema,
  BrandMemberParamsSchema,
  BrandParamsSchema,
  SetBrandMemberBodySchema,
  UserParamsSchema,
  type AddBrandMemberBodySchemaType,
  type BrandAction,
  type BrandMemberRecordSchemaType,
  type UserBrandRoleRecordSchemaType,
} from "@bonlift-ai/contracts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { isCheckViolationOf } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";
import type { RequestAccess } from "./authorization.service.js";
import type { Queryable } from "./session.service.js";
import { assertNotSelf, LAST_ROLE_ERROR, liveBrandRoleExists, lockedUser, staffNameSource } from "./user.service.js";

const OWN_BRAND_ROLE_ERROR = "You cannot change your own brand role.";

interface BrandMemberFlags {
  brand_found: boolean;
  role_found?: boolean;
  target_found: boolean;
  target_disabled?: boolean;
  new_subset?: boolean;
  current_subset: boolean;
  last_role?: boolean;
  written: boolean;
}

// null means no limit: the actor acts through console users.assignBrandRoles.
type GrantLimit = BrandAction[] | null;

const isSubsetOf = (roleId: string, actionsParam: string) => `NOT EXISTS (
  SELECT action FROM role_permissions WHERE role_id = ${roleId}
  EXCEPT SELECT unnest(${actionsParam}::text[])
)`;

const brandCte = `
  brand AS (
    SELECT b.id, b.tenant_id FROM brands b WHERE b.id = $1 AND b.deleted_at IS NULL
  )`;

// Only a role of the brand's own tenant is found; another tenant's role reads as missing.
const roleCte = (actionsParam: string) => `
  role AS (
    SELECT r.id, r.name, ${isSubsetOf("r.id", actionsParam)} AS new_subset
    FROM roles r
    JOIN brand b ON b.tenant_id = r.tenant_id
    WHERE r.id = $3 AND r.kind = 'brand'
  )`;

// With no role on this brand, the current role is empty, so it is a subset.
const userWithCurrentRoleCte = (name: string, match: string, actionsParam: string) => `
  ${name} AS (
    SELECT u.id, u.email, u.display_name, u.status, ${isSubsetOf("ubr.role_id", actionsParam)} AS current_subset
    FROM users u
    LEFT JOIN user_brand_roles ubr ON ubr.user_id = u.id AND ubr.brand_id = $1
    WHERE ${match}
  )`;

// The DO UPDATE re-checks the locked row, so a role changed since the snapshot can't slip past the limit.
const upsertAssignment = (source: string, unlimitedParam: string, actionsParam: string) => `
    INSERT INTO user_brand_roles (user_id, brand_id, tenant_id, role_id, granted_by)
    ${source}
    ON CONFLICT (user_id, brand_id) DO UPDATE
    SET role_id = EXCLUDED.role_id, granted_by = EXCLUDED.granted_by, updated_at = now()
    WHERE ${unlimitedParam}::boolean OR ${isSubsetOf("user_brand_roles.role_id", actionsParam)}
    RETURNING user_id`;

const memberColumns = (userAlias: string, roleAlias: string) => `
  ${userAlias}.id AS user_id, ${userAlias}.email, ${userAlias}.display_name, ${userAlias}.status,
  ${roleAlias}.id AS role_id, ${roleAlias}.name AS role_name`;

const LIST_BRAND_MEMBERS_SQL = `
  SELECT ${memberColumns("u", "r")}
  FROM brands b
  LEFT JOIN user_brand_roles ubr ON ubr.brand_id = b.id
  LEFT JOIN users u ON u.id = ubr.user_id
  LEFT JOIN roles r ON r.id = ubr.role_id
  WHERE b.id = $1 AND b.deleted_at IS NULL
  ORDER BY u.email`;

const LIST_USER_BRAND_ROLES_SQL = `
  SELECT b.id AS brand_id, b.name AS brand_name, t.id AS tenant_id, t.name AS tenant_name,
         r.id AS role_id, r.name AS role_name
  FROM users u
  LEFT JOIN (
    user_brand_roles ubr
    JOIN brands b ON b.id = ubr.brand_id AND b.deleted_at IS NULL
    JOIN tenants t ON t.id = b.tenant_id AND t.deleted_at IS NULL
    JOIN roles r ON r.id = ubr.role_id
  ) ON ubr.user_id = u.id
  WHERE u.id = $1
  ORDER BY t.name, b.name`;

// $1 brand, $2 user, $3 role, $4 actor, $5 unlimited, $6 the actor's brand actions.
const SET_BRAND_MEMBER_SQL = `
  WITH ${brandCte},
  ${roleCte("$6")},
  ${userWithCurrentRoleCte("target", "u.id = $2", "$6")},
  written AS (${upsertAssignment(
    `SELECT t.id, b.id, b.tenant_id, ro.id, $4
    FROM target t CROSS JOIN brand b CROSS JOIN role ro
    WHERE $5::boolean OR (ro.new_subset AND t.current_subset)`,
    "$5",
    "$6",
  )}
  )
  SELECT
    b.id IS NOT NULL AS brand_found,
    ro.id IS NOT NULL AS role_found,
    t.id IS NOT NULL AS target_found,
    COALESCE(ro.new_subset, false) AS new_subset,
    COALESCE(t.current_subset, false) AS current_subset,
    w.user_id IS NOT NULL AS written,
    ${memberColumns("t", "ro")}
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN brand b ON true
  LEFT JOIN role ro ON true
  LEFT JOIN target t ON true
  LEFT JOIN written w ON true`;

// $1 brand, $2 user, $3 unlimited, $4 the actor's brand actions.
const REMOVE_BRAND_MEMBER_SQL = `
  WITH ${brandCte},
  target AS (
    SELECT ubr.user_id AS id, ${isSubsetOf("ubr.role_id", "$4")} AS current_subset,
           NOT EXISTS (SELECT 1 FROM user_console_roles ucr WHERE ucr.user_id = u.id FOR KEY SHARE)
             AND NOT ${liveBrandRoleExists("u.id", " AND lbr.brand_id <> $1")} AS last_role
    FROM ${lockedUser("$2")}
    JOIN user_brand_roles ubr ON ubr.user_id = u.id
    JOIN brand b ON b.id = ubr.brand_id
  ),
  written AS (
    DELETE FROM user_brand_roles ubr
    USING target t
    WHERE ubr.user_id = t.id
      AND ubr.brand_id = $1
      AND NOT t.last_role
      AND ($3::boolean OR ${isSubsetOf("ubr.role_id", "$4")})
    RETURNING ubr.user_id
  )
  SELECT
    b.id IS NOT NULL AS brand_found,
    t.id IS NOT NULL AS target_found,
    COALESCE(t.current_subset, false) AS current_subset,
    COALESCE(t.last_role, false) AS last_role,
    w.user_id IS NOT NULL AS written
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN brand b ON true
  LEFT JOIN target t ON true
  LEFT JOIN written w ON true`;

// $1 brand, $2 email, $3 role, $4 actor, $5 unlimited, $6 the actor's brand actions, $7 display name, $8 its source.
// `allowed` holds the flags; both the user insert and the assignment read it, so a failed flag writes nothing.
const ADD_BRAND_MEMBER_SQL = `
  WITH ${brandCte},
  ${roleCte("$6")},
  ${userWithCurrentRoleCte("existing", "u.email = $2", "$6")},
  allowed AS (
    SELECT b.id AS brand_id, b.tenant_id, ro.id AS role_id
    FROM brand b
    CROSS JOIN role ro
    LEFT JOIN existing e ON true
    WHERE e.status IS DISTINCT FROM 'disabled'
      AND ($5::boolean OR (ro.new_subset AND COALESCE(e.current_subset, true)))
  ),
  created AS (
    INSERT INTO users (email, display_name, display_name_source)
    SELECT $2::text, $7::text, $8::text
    FROM allowed
    WHERE NOT EXISTS (SELECT 1 FROM existing)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email, display_name, status
  ),
  target AS (
    SELECT id, email, display_name, status FROM created
    UNION ALL
    SELECT id, email, display_name, status FROM existing
  ),
  written AS (${upsertAssignment(
    `SELECT t.id, a.brand_id, a.tenant_id, a.role_id, $4
    FROM target t CROSS JOIN allowed a`,
    "$5",
    "$6",
  )}
  )
  SELECT
    b.id IS NOT NULL AS brand_found,
    ro.id IS NOT NULL AS role_found,
    true AS target_found,
    COALESCE(e.status = 'disabled', false) AS target_disabled,
    COALESCE(ro.new_subset, false) AS new_subset,
    COALESCE(e.current_subset, true) AS current_subset,
    w.user_id IS NOT NULL AS written,
    ${memberColumns("t", "ro")}
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN brand b ON true
  LEFT JOIN role ro ON true
  LEFT JOIN existing e ON true
  LEFT JOIN target t ON true
  LEFT JOIN written w ON true`;

function toBrandMemberRecord(row: any): BrandMemberRecordSchemaType {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    roleId: row.role_id,
    roleName: row.role_name,
  };
}

function toUserBrandRoleRecord(row: any): UserBrandRoleRecordSchemaType {
  return {
    brandId: row.brand_id,
    brandName: row.brand_name,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    roleId: row.role_id,
    roleName: row.role_name,
  };
}

function grantLimitOf(actor: RequestAccess, actorBrandActions: BrandAction[] | null): GrantLimit {
  if (actor.consoleActions.includes("users.assignBrandRoles")) return null;
  // Fail closed: without the console action, only a role on this brand allows a write.
  if (!actorBrandActions) throw new NotFoundError("Brand does not exist.");
  return actorBrandActions;
}

function limitParams(limit: GrantLimit): [boolean, BrandAction[]] {
  return [limit === null, limit ?? []];
}

function assertNotOwnEmail(actor: RequestAccess, email: string): void {
  if (actor.user.email.toLowerCase() === email) throw new ForbiddenError(OWN_BRAND_ROLE_ERROR);
}

function assertBrandMemberGuards(flags: BrandMemberFlags, limit: GrantLimit, targetMissing: string): void {
  if (!flags.brand_found) throw new NotFoundError("Brand does not exist.");
  if (flags.role_found === false) throw new NotFoundError("Role does not exist.");
  if (!flags.target_found) throw new NotFoundError(targetMissing);
  if (flags.target_disabled) throw new ConflictError("User is disabled. Reinvite them first.");
  if (limit !== null) {
    if (flags.new_subset === false) throw new ForbiddenError("A brand role can only hold actions you hold on this brand.");
    if (!flags.current_subset) throw new ForbiddenError("The member's role on this brand holds actions you lack.");
  }
  if (flags.last_role) throw new ConflictError(LAST_ROLE_ERROR);
  if (!flags.written) throw new ConflictError("The member changed while saving. Try again.");
}

function toAddMemberError(error: unknown): Error | null {
  if (isCheckViolationOf(error, "users_email_check")) return new ValidationError("Invalid email.");
  return null;
}

export async function listBrandMembers(db: Queryable, brandId: string): Promise<BrandMemberRecordSchemaType[]> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await db.query(LIST_BRAND_MEMBERS_SQL, [brandId]);
  if (result.rows.length === 0) throw new NotFoundError("Brand does not exist.");
  return result.rows.filter((row) => row.user_id).map(toBrandMemberRecord);
}

export async function listUserBrandRoles(db: Queryable, userId: string): Promise<UserBrandRoleRecordSchemaType[]> {
  assertValid(UserParamsSchema, { userId });

  const result = await db.query(LIST_USER_BRAND_ROLES_SQL, [userId]);
  if (result.rows.length === 0) throw new NotFoundError("User does not exist.");
  return result.rows.filter((row) => row.brand_id).map(toUserBrandRoleRecord);
}

export async function addBrandMember(
  db: Queryable,
  actor: RequestAccess,
  actorBrandActions: BrandAction[] | null,
  brandId: string,
  body: AddBrandMemberBodySchemaType,
): Promise<BrandMemberRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(AddBrandMemberBodySchema, body);
  const email = body.email.toLowerCase();
  assertNotOwnEmail(actor, email);
  const limit = grantLimitOf(actor, actorBrandActions);

  try {
    const result = await db.query(ADD_BRAND_MEMBER_SQL, [
      brandId,
      email,
      body.roleId,
      actor.user.id,
      ...limitParams(limit),
      body.displayName ?? null,
      staffNameSource(body.displayName),
    ]);
    const row = result.rows[0];
    assertBrandMemberGuards(row, limit, "User does not exist.");
    return toBrandMemberRecord(row);
  } catch (error) {
    throw toAddMemberError(error) ?? error;
  }
}

export async function setBrandMember(
  db: Queryable,
  actor: RequestAccess,
  actorBrandActions: BrandAction[] | null,
  brandId: string,
  userId: string,
  roleId: string,
): Promise<BrandMemberRecordSchemaType> {
  assertValid(BrandMemberParamsSchema, { brandId, userId });
  assertValid(SetBrandMemberBodySchema, { roleId });
  assertNotSelf(actor, userId, OWN_BRAND_ROLE_ERROR);
  const limit = grantLimitOf(actor, actorBrandActions);

  const result = await db.query(SET_BRAND_MEMBER_SQL, [brandId, userId, roleId, actor.user.id, ...limitParams(limit)]);
  const row = result.rows[0];
  assertBrandMemberGuards(row, limit, "User does not exist.");
  return toBrandMemberRecord(row);
}

export async function removeBrandMember(
  db: Queryable,
  actor: RequestAccess,
  actorBrandActions: BrandAction[] | null,
  brandId: string,
  userId: string,
): Promise<void> {
  assertValid(BrandMemberParamsSchema, { brandId, userId });
  assertNotSelf(actor, userId, OWN_BRAND_ROLE_ERROR);
  const limit = grantLimitOf(actor, actorBrandActions);

  const result = await db.query(REMOVE_BRAND_MEMBER_SQL, [brandId, userId, ...limitParams(limit)]);
  assertBrandMemberGuards(result.rows[0], limit, "User is not a member of this brand.");
}
