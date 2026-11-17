import {
  BRAND_ACTIONS,
  CONSOLE_ACTIONS,
  CreateRoleBodySchema,
  isBrandAction,
  isConsoleAction,
  RoleKindSchema,
  RoleParamsSchema,
  UpdateRoleBodySchema,
  type CreateRoleBodySchemaType,
  type RoleKind,
  type RoleRecordSchemaType,
  type UpdateRoleBodySchemaType,
} from "@bonlift-ai/contracts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { isCheckViolationOf, isForeignKeyViolation, isUniqueViolationOf } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";
import type { RequestAccess } from "./authorization.service.js";
import type { Queryable } from "./session.service.js";

interface GuardFlags {
  found: boolean;
  builtin: boolean;
  actor_holds: boolean;
  current_subset?: boolean;
  kind_matches?: boolean;
}

const assignmentCountOf = (alias: string) => `
  (SELECT count(*) FROM user_console_roles ucr WHERE ucr.role_id = ${alias}.id)
  + (SELECT count(*) FROM user_brand_roles ubr WHERE ubr.role_id = ${alias}.id)`;

// $1 is the role, $2 the actor: a role they hold as their console role or on any brand.
const ACTOR_HOLDS = `(
  EXISTS (SELECT 1 FROM user_console_roles ucr WHERE ucr.user_id = $2 AND ucr.role_id = r.id)
  OR EXISTS (SELECT 1 FROM user_brand_roles ubr WHERE ubr.user_id = $2 AND ubr.role_id = r.id)
)`;

// A non-Admin can't touch a console role broader than their own console actions.
const currentSubset = (isAdminParam: string, actionsParam: string) => `(
  ${isAdminParam}::boolean
  OR r.kind <> 'console'
  OR NOT EXISTS (
    SELECT action FROM role_permissions WHERE role_id = r.id
    EXCEPT SELECT unnest(${actionsParam}::text[])
  )
)`;

function actionKindOf(key: string): RoleKind | null {
  if (isConsoleAction(key)) return "console";
  if (isBrandAction(key)) return "brand";
  return null;
}

function catalogOf(kind: RoleKind): readonly string[] {
  return kind === "console" ? CONSOLE_ACTIONS : BRAND_ACTIONS;
}

// Stale keys and keys of the other kind drop out; the catalog fixes the order.
function inCatalogOrder(kind: RoleKind, actions: readonly string[]): string[] {
  const held = new Set(actions);
  return catalogOf(kind).filter((key) => held.has(key));
}

function assertActionsOfKind(kind: RoleKind, actions: readonly string[]): void {
  for (const action of actions) {
    const actionKind = actionKindOf(action);
    if (!actionKind) throw new ValidationError(`Unknown action ${action}.`);
    if (actionKind !== kind) throw new ValidationError(`${action} is not a ${kind} action.`);
  }
}

function kindOfActions(actions: readonly string[]): RoleKind | null {
  if (actions.length === 0) return null;
  const kind = actionKindOf(actions[0]);
  if (!kind) throw new ValidationError(`Unknown action ${actions[0]}.`);
  assertActionsOfKind(kind, actions);
  return kind;
}

function assertActorMayGrant(actor: RequestAccess, kind: RoleKind | null, actions: readonly string[]): void {
  if (kind !== "console" || actor.isAdmin) return;
  const held = new Set<string>(actor.consoleActions);
  if (actions.some((action) => !held.has(action))) {
    throw new ForbiddenError("A console role can only hold console actions you hold.");
  }
}

function assertGuardsPass(flags: GuardFlags): void {
  if (!flags.found) throw new NotFoundError("Role does not exist.");
  if (flags.builtin) throw new ForbiddenError("A built-in role cannot be changed.");
  if (flags.actor_holds) throw new ForbiddenError("You cannot change a role you hold.");
  if (flags.current_subset === false) throw new ForbiddenError("The role holds console actions you lack.");
  if (flags.kind_matches === false) throw new ValidationError("The actions do not match the role's kind.");
}

function toRoleError(error: unknown, name?: string): Error | null {
  if (isUniqueViolationOf(error, "roles_kind_name_key")) return new ConflictError(`Role ${name} already exists.`);
  if (isCheckViolationOf(error, "roles_name_check")) return new ValidationError("Invalid role name.");
  return null;
}

function mapRoleRow(row: any, actions: readonly string[]): RoleRecordSchemaType {
  const isAdmin = row.is_builtin && row.kind === "console";
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isBuiltin: row.is_builtin,
    actions: isAdmin ? [...CONSOLE_ACTIONS] : inCatalogOrder(row.kind, actions),
    assignmentCount: Number(row.assignment_count ?? 0),
  };
}

export async function listRoles(db: Queryable, kind?: RoleKind): Promise<RoleRecordSchemaType[]> {
  if (kind !== undefined) assertValid(RoleKindSchema, kind);

  const result = await db.query(
    `
    SELECT
      r.id, r.name, r.kind, r.is_builtin,
      COALESCE((SELECT array_agg(rp.action) FROM role_permissions rp WHERE rp.role_id = r.id), '{}') AS actions,
      ${assignmentCountOf("r")} AS assignment_count
    FROM roles r
    WHERE $1::text IS NULL OR r.kind = $1
    ORDER BY r.kind, r.name, r.id`,
    [kind ?? null],
  );

  return result.rows.map((row) => mapRoleRow(row, row.actions));
}

export async function createRole(
  db: Queryable,
  actor: RequestAccess,
  body: CreateRoleBodySchemaType,
): Promise<RoleRecordSchemaType> {
  assertValid(CreateRoleBodySchema, body);
  assertActionsOfKind(body.kind, body.actions);
  assertActorMayGrant(actor, body.kind, body.actions);

  try {
    const result = await db.query(
      `
      WITH role AS (
        INSERT INTO roles (name, kind) VALUES ($1, $2)
        RETURNING id, name, kind, is_builtin
      ),
      permissions AS (
        INSERT INTO role_permissions (role_id, action)
        SELECT role.id, a.action FROM role CROSS JOIN unnest($3::text[]) AS a(action)
      )
      SELECT id, name, kind, is_builtin FROM role`,
      [body.name, body.kind, body.actions],
    );

    return mapRoleRow(result.rows[0], body.actions);
  } catch (error) {
    throw toRoleError(error, body.name) ?? error;
  }
}

// Removed and added keys never overlap, so the delete and the insert can run in the same statement.
const REPLACE_PERMISSIONS = `,
  removed AS (
    DELETE FROM role_permissions rp
    USING updated u
    WHERE rp.role_id = u.id
      AND rp.action <> ALL($7::text[])
  ),
  added AS (
    INSERT INTO role_permissions (role_id, action)
    SELECT u.id, a.action FROM updated u CROSS JOIN unnest($7::text[]) AS a(action)
    ON CONFLICT DO NOTHING
  )`;

function updateRoleSql(replacesActions: boolean): string {
  const kindMatches = replacesActions ? "($6::text IS NULL OR r.kind = $6)" : "true";
  return `
    WITH target AS (
      SELECT r.id, r.is_builtin, ${kindMatches} AS kind_matches, ${ACTOR_HOLDS} AS actor_holds,
             ${currentSubset("$4", "$5")} AS current_subset
      FROM roles r
      WHERE r.id = $1
    ),
    updated AS (
      UPDATE roles r
      SET name = COALESCE($3::text, r.name), updated_at = now()
      FROM target t
      WHERE r.id = t.id
        AND NOT t.is_builtin
        AND t.kind_matches
        AND NOT t.actor_holds
        AND t.current_subset
      RETURNING r.id, r.name, r.kind, r.is_builtin
    )${replacesActions ? REPLACE_PERMISSIONS : ""}
    SELECT
      t.id IS NOT NULL AS found,
      COALESCE(t.is_builtin, false) AS builtin,
      COALESCE(t.kind_matches, false) AS kind_matches,
      COALESCE(t.actor_holds, false) AS actor_holds,
      COALESCE(t.current_subset, false) AS current_subset,
      u.id, u.name, u.kind, u.is_builtin,
      COALESCE((SELECT array_agg(rp.action) FROM role_permissions rp WHERE rp.role_id = u.id), '{}') AS current_actions,
      ${assignmentCountOf("u")} AS assignment_count
    FROM (VALUES (1)) AS one (x)
    LEFT JOIN target t ON true
    LEFT JOIN updated u ON true`;
}

function updateRoleParams(roleId: string, actor: RequestAccess, body: UpdateRoleBodySchemaType, kind: RoleKind | null) {
  const params: unknown[] = [roleId, actor.user.id, body.name ?? null, actor.isAdmin, actor.consoleActions];
  return body.actions === undefined ? params : [...params, kind, body.actions];
}

export async function updateRole(
  db: Queryable,
  actor: RequestAccess,
  roleId: string,
  body: UpdateRoleBodySchemaType,
): Promise<RoleRecordSchemaType> {
  assertValid(RoleParamsSchema, { roleId });
  assertValid(UpdateRoleBodySchema, body);
  const kind = body.actions === undefined ? null : kindOfActions(body.actions);
  assertActorMayGrant(actor, kind, body.actions ?? []);

  try {
    const result = await db.query(
      updateRoleSql(body.actions !== undefined),
      updateRoleParams(roleId, actor, body, kind),
    );
    const row = result.rows[0];
    assertGuardsPass(row);
    if (!row.id) throw new NotFoundError("Role does not exist.");

    return mapRoleRow(row, body.actions ?? row.current_actions);
  } catch (error) {
    throw toRoleError(error, body.name) ?? error;
  }
}

export async function deleteRole(db: Queryable, actor: RequestAccess, roleId: string): Promise<void> {
  assertValid(RoleParamsSchema, { roleId });

  try {
    const result = await db.query(
      `
      WITH target AS (
        SELECT r.id, r.is_builtin, ${ACTOR_HOLDS} AS actor_holds,
               ${currentSubset("$3", "$4")} AS current_subset
        FROM roles r
        WHERE r.id = $1
      ),
      deleted AS (
        DELETE FROM roles r
        USING target t
        WHERE r.id = t.id
          AND NOT t.is_builtin
          AND NOT t.actor_holds
          AND t.current_subset
      )
      SELECT
        t.id IS NOT NULL AS found,
        COALESCE(t.is_builtin, false) AS builtin,
        COALESCE(t.actor_holds, false) AS actor_holds,
        COALESCE(t.current_subset, false) AS current_subset
      FROM (VALUES (1)) AS one (x)
      LEFT JOIN target t ON true`,
      [roleId, actor.user.id, actor.isAdmin, actor.consoleActions],
    );

    assertGuardsPass(result.rows[0]);
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new ConflictError("Role is in use.");
    throw error;
  }
}
