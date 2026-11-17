import {
  InviteUserBodySchema,
  SetConsoleRoleBodySchema,
  UpdateUserBodySchema,
  UserParamsSchema,
  type DisplayNameSource,
  type InviteUserBodySchemaType,
  type UpdateUserBodySchemaType,
  type UserRecordSchemaType,
} from "@bonlift-ai/contracts";
import type { Pool, PoolClient } from "pg";
import { AccountNotApprovedError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { isCheckViolationOf, isUniqueViolationOf } from "../utils/pgErrors.js";
import { withTransaction } from "../utils/transaction.js";
import { assertValid } from "../utils/validate.js";
import type { RequestAccess } from "./authorization.service.js";
import type { Queryable, SessionUser } from "./session.service.js";

export interface VerifiedIdentity {
  provider: "google";
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

// Thrown inside the transaction so it rolls back; never leaves this module.
class InviteNotFoundError extends Error {}

// A name typed by staff locks it for the user; no name leaves the source empty.
export function staffNameSource(name: string | null | undefined): DisplayNameSource | null {
  return name ? "staff" : null;
}

function isInviteRace(error: unknown): boolean {
  return error instanceof InviteNotFoundError || isUniqueViolationOf(error, "user_identities_pkey");
}

interface KnownIdentityResult {
  identityExists: boolean;
  user: SessionUser | null;
}

export async function resolveUserFromIdentity(
  pool: Pool,
  identity: VerifiedIdentity,
): Promise<SessionUser> {
  const known = await signInKnownIdentity(pool, identity);
  if (known.user) return known.user;
  if (known.identityExists) throw new AccountNotApprovedError("disabled");
  if (!identity.emailVerified) throw new AccountNotApprovedError("email_unverified");

  try {
    return await withTransaction(pool, (client) => linkInvitedUser(client, identity));
  } catch (error) {
    if (!isInviteRace(error)) throw error;
    // A racing first sign-in may have linked this identity first; sign in through it, or refuse.
    const retry = await signInKnownIdentity(pool, identity);
    if (!retry.user) throw new AccountNotApprovedError(retry.identityExists ? "disabled" : "unlisted");
    return retry.user;
  }
}

// Always returns one row: identity_exists tells a disabled user (identity, no update) from an unknown identity.
async function signInKnownIdentity(
  pool: Pool,
  identity: VerifiedIdentity,
): Promise<KnownIdentityResult> {
  const result = await pool.query(
    `
    WITH signed_in AS (
      UPDATE users u
      SET status = 'active',
          last_login_at = now(),
          display_name = COALESCE(u.display_name, NULLIF($3, '')),
          display_name_source = CASE
            WHEN u.display_name IS NULL AND NULLIF($3, '') IS NOT NULL THEN 'provider'
            ELSE u.display_name_source
          END,
          updated_at = now()
      FROM user_identities ui
      WHERE ui.provider = $1
        AND ui.provider_subject = $2
        AND u.id = ui.user_id
        AND u.status IN ('active', 'invited')
      RETURNING u.id, u.email, u.display_name
    )
    SELECT
      EXISTS (
        SELECT 1 FROM user_identities WHERE provider = $1 AND provider_subject = $2
      ) AS identity_exists,
      s.id, s.email, s.display_name
    FROM (VALUES (1)) AS one (x)
    LEFT JOIN signed_in s ON true
    `,
    [identity.provider, identity.subject, identity.name],
  );

  const row = result.rows[0];
  return { identityExists: row.identity_exists, user: row.id ? toSessionUser(row) : null };
}

async function linkInvitedUser(
  client: PoolClient,
  identity: VerifiedIdentity,
): Promise<SessionUser> {
  const user = await activateInvitedUser(client, identity.email.toLowerCase(), identity.name);
  await insertIdentity(client, user.id, identity);
  return user;
}

async function activateInvitedUser(
  client: PoolClient,
  email: string,
  name: string | null,
): Promise<SessionUser> {
  const result = await client.query(
    `
    UPDATE users
    SET status = 'active',
        last_login_at = now(),
        display_name = COALESCE(display_name, NULLIF($2, '')),
        display_name_source = CASE
          WHEN display_name IS NULL AND NULLIF($2, '') IS NOT NULL THEN 'provider'
          ELSE display_name_source
        END,
        updated_at = now()
    WHERE email = $1
      AND status = 'invited'
    RETURNING id, email, display_name
    `,
    [email, name],
  );

  const row = result.rows[0];
  // Zero rows also covers a racing sign-in that activated this invite first (READ COMMITTED re-check).
  if (!row) throw new InviteNotFoundError();
  return toSessionUser(row);
}

async function insertIdentity(
  client: PoolClient,
  userId: string,
  identity: VerifiedIdentity,
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO user_identities (user_id, provider, provider_subject) VALUES ($1, $2, $3)`,
      [userId, identity.provider, identity.subject],
    );
  } catch (error) {
    if (isUniqueViolationOf(error, "user_identities_user_provider_key")) {
      throw new AccountNotApprovedError("second_account");
    }
    throw error;
  }
}

function toSessionUser(row: { id: string; email: string; display_name: string | null }): SessionUser {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

const ADMIN_TARGET_ERROR = "Only an Admin can change an Admin user.";
const OWN_CONSOLE_ROLE_ERROR = "You cannot change your own console role.";
export const LAST_ROLE_ERROR = "A user must keep at least one role.";

interface ConsoleRoleFlags {
  target_found: boolean;
  target_is_admin: boolean;
  current_subset: boolean;
  written: boolean;
  last_role?: boolean;
  role_found?: boolean;
  role_builtin?: boolean;
  new_subset?: boolean;
}

interface InviteFlags {
  console_role_found: boolean;
  console_role_builtin: boolean;
  console_subset: boolean;
  brand_roles_found: boolean;
  brands_found: boolean;
}

type InviteBrandRole = NonNullable<InviteUserBodySchemaType["brandRoles"]>[number];

interface DeleteFlags {
  target_found: boolean;
  target_disabled: boolean;
  target_is_admin: boolean;
  deleted: boolean;
}

interface StatusFlags {
  target_found: boolean;
  target_is_admin: boolean;
  id: string | null;
}

const brandCountOf = (alias: string) => `
  (SELECT count(*)
   FROM user_brand_roles ubr
   JOIN brands b ON b.id = ubr.brand_id
   WHERE ubr.user_id = ${alias}.id AND b.deleted_at IS NULL)`;

const userRecordColumns = (userAlias: string, roleAlias: string) => `
  ${userAlias}.id, ${userAlias}.email, ${userAlias}.display_name, ${userAlias}.display_name_source,
  ${userAlias}.status, ${userAlias}.last_login_at,
  ${roleAlias}.id AS role_id, ${roleAlias}.name AS role_name, ${roleAlias}.is_builtin AS role_is_builtin,
  ${brandCountOf(userAlias)} AS brand_count`;

// Removals lock the user first, so two removals running at once can't both take their last role.
export const lockedUser = (userIdParam: string) => `(SELECT * FROM users WHERE id = ${userIdParam} FOR UPDATE) u`;

const isAdminUser = (alias: string) => `EXISTS (
  SELECT 1 FROM user_console_roles ucr JOIN roles r ON r.id = ucr.role_id
  WHERE ucr.user_id = ${alias}.id AND r.is_builtin
)`;

const isSubsetOf = (roleId: string, actionsParam: string) => `NOT EXISTS (
  SELECT action FROM role_permissions WHERE role_id = ${roleId}
  EXCEPT SELECT unnest(${actionsParam}::text[])
)`;

// Re-read on the locked row, so a role granted after the snapshot (an Admin's, or a broader one) is not overwritten.
const lockedRoleWithin = (roleId: string, isAdminParam: string, actionsParam: string) => `(
  ${isAdminParam}::boolean
  OR (
    NOT EXISTS (SELECT 1 FROM roles lr WHERE lr.id = ${roleId} AND lr.is_builtin)
    AND ${isSubsetOf(roleId, actionsParam)}
  )
)`;

// A locking read skips a role deleted by a removal that committed while this statement waited for the user lock.
export const liveBrandRoleExists = (userId: string, extraCondition = "") => `EXISTS (
  SELECT 1
  FROM user_brand_roles lbr
  JOIN brands lb ON lb.id = lbr.brand_id AND lb.deleted_at IS NULL
  JOIN tenants lt ON lt.id = lb.tenant_id AND lt.deleted_at IS NULL
  WHERE lbr.user_id = ${userId}${extraCondition}
  FOR KEY SHARE OF lbr
)`;

const CONSOLE_REMOVAL = {
  from: lockedUser("$1"),
  lastRole: `ucr.role_id IS NOT NULL AND NOT ${liveBrandRoleExists("u.id")}`,
};

// $1 is the target user. With no console role, the current role is empty, so it is a subset.
const consoleTargetCte = (actionsParam: string, forRemoval = false) => `
  target AS (
    SELECT u.id, u.email, u.display_name, u.display_name_source, u.status, u.last_login_at,
           ucr.role_id AS current_role_id,
           COALESCE(cr.is_builtin, false) AS target_is_admin,
           ${isSubsetOf("ucr.role_id", actionsParam)} AS current_subset,
           ${forRemoval ? CONSOLE_REMOVAL.lastRole : "false"} AS last_role
    FROM ${forRemoval ? CONSOLE_REMOVAL.from : "users u"}
    LEFT JOIN user_console_roles ucr ON ucr.user_id = u.id
    LEFT JOIN roles cr ON cr.id = ucr.role_id
    WHERE u.id = $1
  )`;

const SET_CONSOLE_ROLE_SQL = `
  WITH ${consoleTargetCte("$5")},
  role AS (
    SELECT r.id, r.name, r.is_builtin, ${isSubsetOf("r.id", "$5")} AS new_subset
    FROM roles r
    WHERE r.id = $2 AND r.kind = 'console'
  ),
  assigned AS (
    INSERT INTO user_console_roles (user_id, role_id, granted_by)
    SELECT t.id, ro.id, $3
    FROM target t CROSS JOIN role ro
    WHERE $4::boolean
       OR (NOT ro.is_builtin AND NOT t.target_is_admin AND ro.new_subset AND t.current_subset)
    ON CONFLICT (user_id) DO UPDATE
    SET role_id = EXCLUDED.role_id, granted_by = EXCLUDED.granted_by, updated_at = now()
    WHERE ${lockedRoleWithin("user_console_roles.role_id", "$4", "$5")}
    RETURNING user_id
  )
  SELECT
    t.id IS NOT NULL AS target_found,
    ro.id IS NOT NULL AS role_found,
    COALESCE(ro.is_builtin, false) AS role_builtin,
    COALESCE(t.target_is_admin, false) AS target_is_admin,
    COALESCE(ro.new_subset, false) AS new_subset,
    COALESCE(t.current_subset, false) AS current_subset,
    a.user_id IS NOT NULL AS written,
    ${userRecordColumns("t", "ro")}
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN target t ON true
  LEFT JOIN role ro ON true
  LEFT JOIN assigned a ON true`;

const CLEAR_CONSOLE_ROLE_SQL = `
  WITH ${consoleTargetCte("$3", true)},
  cleared AS (
    DELETE FROM user_console_roles ucr
    USING target t
    WHERE ucr.user_id = t.id
      AND NOT t.last_role
      AND ($2::boolean OR (NOT t.target_is_admin AND t.current_subset))
      AND ${lockedRoleWithin("ucr.role_id", "$2", "$3")}
    RETURNING ucr.user_id
  )
  SELECT
    t.id IS NOT NULL AS target_found,
    COALESCE(t.target_is_admin, false) AS target_is_admin,
    COALESCE(t.current_subset, false) AS current_subset,
    COALESCE(t.last_role, false) AS last_role,
    (t.current_role_id IS NULL OR c.user_id IS NOT NULL) AS written
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN target t ON true
  LEFT JOIN cleared c ON true`;

// $1 is the target, $2 whether the actor is an Admin. The update runs only from fromStatus.
const statusChangeSql = (toStatus: string, fromStatus: string, afterChange = "") => `
  WITH target AS (
    SELECT u.id, ${isAdminUser("u")} AS target_is_admin
    FROM users u
    WHERE u.id = $1
  ),
  changed AS (
    UPDATE users u
    SET status = '${toStatus}', updated_at = now()
    FROM target t
    WHERE u.id = t.id
      AND u.status ${fromStatus}
      AND ($2::boolean OR NOT t.target_is_admin)
    RETURNING u.id, u.email, u.display_name, u.display_name_source, u.status, u.last_login_at
  )${afterChange}
  SELECT
    t.id IS NOT NULL AS target_found,
    COALESCE(t.target_is_admin, false) AS target_is_admin,
    ${userRecordColumns("c", "cr")}
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN target t ON true
  LEFT JOIN changed c ON true
  LEFT JOIN user_console_roles ucr ON ucr.user_id = c.id
  LEFT JOIN roles cr ON cr.id = ucr.role_id`;

// The sessions go only when the update hits a row.
const DISABLE_USER_SQL = statusChangeSql(
  "disabled",
  "<> 'disabled'",
  `,
  sessions AS (
    DELETE FROM user_sessions s USING changed c WHERE s.user_id = c.id
  )`,
);

const REINVITE_USER_SQL = statusChangeSql("invited", "= 'disabled'");

// $1 is the target, $2 the new name (NULL clears it), $3 whether the actor is an Admin, $4 the name source.
// FOR SHARE makes a concurrent change of the target's existing console role finish first, so the Admin check sees it;
// a role row inserted concurrently for a user who had none is not covered (as in disable/reinvite).
const UPDATE_USER_SQL = `
  WITH target AS (
    SELECT u.id, COALESCE(r.is_builtin, false) AS target_is_admin
    FROM users u
    LEFT JOIN (
      SELECT ucr.user_id, ucr.role_id
      FROM user_console_roles ucr
      WHERE ucr.user_id = $1
      FOR SHARE
    ) cr ON cr.user_id = u.id
    LEFT JOIN roles r ON r.id = cr.role_id
    WHERE u.id = $1
  ),
  changed AS (
    UPDATE users u
    SET display_name = $2, display_name_source = $4, updated_at = now()
    FROM target t
    WHERE u.id = t.id
      AND ($3::boolean OR NOT t.target_is_admin)
    RETURNING u.id, u.email, u.display_name, u.display_name_source, u.status, u.last_login_at
  )
  SELECT
    t.id IS NOT NULL AS target_found,
    COALESCE(t.target_is_admin, false) AS target_is_admin,
    ${userRecordColumns("c", "cr")}
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN target t ON true
  LEFT JOIN changed c ON true
  LEFT JOIN user_console_roles ucr ON ucr.user_id = c.id
  LEFT JOIN roles cr ON cr.id = ucr.role_id`;

// $1 is the target, $2 whether the actor is an Admin. Same FOR SHARE re-check as UPDATE_USER_SQL;
// a role row inserted concurrently for a user who had none is not covered (as in disable/reinvite).
// The cascades remove sessions, identities and role assignments; granted_by on others' assignments becomes NULL.
const DELETE_USER_SQL = `
  WITH target AS (
    SELECT u.id, u.status = 'disabled' AS target_disabled, COALESCE(r.is_builtin, false) AS target_is_admin
    FROM users u
    LEFT JOIN (
      SELECT ucr.user_id, ucr.role_id
      FROM user_console_roles ucr
      WHERE ucr.user_id = $1
      FOR SHARE
    ) cr ON cr.user_id = u.id
    LEFT JOIN roles r ON r.id = cr.role_id
    WHERE u.id = $1
  ),
  deleted AS (
    DELETE FROM users u
    USING target t
    WHERE u.id = t.id
      AND u.status = 'disabled'
      AND ($2::boolean OR NOT t.target_is_admin)
    RETURNING u.id
  )
  SELECT
    t.id IS NOT NULL AS target_found,
    COALESCE(t.target_disabled, false) AS target_disabled,
    COALESCE(t.target_is_admin, false) AS target_is_admin,
    d.id IS NOT NULL AS deleted
  FROM (VALUES (1)) AS one (x)
  LEFT JOIN target t ON true
  LEFT JOIN deleted d ON true`;

// $1 email, $2 name, $3 name source, $4 actor, $5 console role (or NULL), $6/$7 brand/role pairs,
// $8 whether the actor is an Admin, $9 the actor's console actions.
// `allowed` holds the flags; the user insert reads it and every assignment reads the user, so a failed flag writes nothing.
// The main query can't see this statement's inserts, so the brand count comes from `brands_assigned`.
const INVITE_USER_SQL = `
  WITH console_role AS (
    SELECT r.id, r.name, r.is_builtin, ${isSubsetOf("r.id", "$9")} AS new_subset
    FROM roles r
    WHERE r.id = $5::uuid AND r.kind = 'console'
  ),
  brand_pairs AS (
    SELECT q.brand_id, q.role_id, b.id IS NOT NULL AS brand_found, r.id IS NOT NULL AS role_found
    FROM unnest($6::uuid[], $7::uuid[]) AS q (brand_id, role_id)
    LEFT JOIN (
      brands b JOIN tenants t ON t.id = b.tenant_id AND t.deleted_at IS NULL
    ) ON b.id = q.brand_id AND b.deleted_at IS NULL
    LEFT JOIN roles r ON r.id = q.role_id AND r.kind = 'brand'
  ),
  flags AS (
    SELECT
      ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM console_role)) AS console_role_found,
      EXISTS (SELECT 1 FROM console_role WHERE is_builtin) AS console_role_builtin,
      NOT EXISTS (SELECT 1 FROM console_role WHERE NOT new_subset) AS console_subset,
      NOT EXISTS (SELECT 1 FROM brand_pairs WHERE NOT role_found) AS brand_roles_found,
      NOT EXISTS (SELECT 1 FROM brand_pairs WHERE NOT brand_found) AS brands_found
  ),
  allowed AS (
    SELECT 1 FROM flags f
    WHERE f.console_role_found AND f.brand_roles_found AND f.brands_found
      AND ($8::boolean OR (NOT f.console_role_builtin AND f.console_subset))
  ),
  created AS (
    INSERT INTO users (email, display_name, display_name_source)
    SELECT $1::text, $2::text, $3::text FROM allowed
    RETURNING id, email, display_name, display_name_source, status, last_login_at
  ),
  console_assigned AS (
    INSERT INTO user_console_roles (user_id, role_id, granted_by)
    SELECT c.id, cr.id, $4 FROM created c CROSS JOIN console_role cr
  ),
  brands_assigned AS (
    INSERT INTO user_brand_roles (user_id, brand_id, role_id, granted_by)
    SELECT c.id, bp.brand_id, bp.role_id, $4 FROM created c CROSS JOIN brand_pairs bp
    RETURNING brand_id
  )
  SELECT
    f.console_role_found, f.console_role_builtin, f.console_subset, f.brand_roles_found, f.brands_found,
    c.id, c.email, c.display_name, c.display_name_source, c.status, c.last_login_at,
    cr.id AS role_id, cr.name AS role_name, cr.is_builtin AS role_is_builtin,
    (SELECT count(*) FROM brands_assigned) AS brand_count
  FROM flags f
  LEFT JOIN created c ON true
  LEFT JOIN console_role cr ON c.id IS NOT NULL`;

function toUserRecord(row: any): UserRecordSchemaType {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    displayNameSource: row.display_name_source ?? null,
    status: row.status,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    consoleRole: row.role_id ? { id: row.role_id, name: row.role_name, isBuiltin: row.role_is_builtin } : null,
    brandCount: Number(row.brand_count ?? 0),
  };
}

export function assertNotSelf(actor: RequestAccess, userId: string, message: string): void {
  // Postgres compares UUIDs case-insensitively, so this must too.
  if (actor.user.id.toLowerCase() === userId.toLowerCase()) throw new ForbiddenError(message);
}

function assertConsoleRoleGuards(actor: RequestAccess, flags: ConsoleRoleFlags): void {
  if (!flags.target_found) throw new NotFoundError("User does not exist.");
  if (flags.role_found === false) throw new NotFoundError("Role does not exist.");
  if (actor.isAdmin) return;
  if (flags.role_builtin) throw new ForbiddenError("Only an Admin can assign the Admin role.");
  if (flags.target_is_admin) throw new ForbiddenError(ADMIN_TARGET_ERROR);
  if (flags.new_subset === false) throw new ForbiddenError("A console role can only hold console actions you hold.");
  if (!flags.current_subset) throw new ForbiddenError("The user's console role holds actions you lack.");
}

function assertConsoleRoleWritten(actor: RequestAccess, flags: ConsoleRoleFlags): void {
  assertConsoleRoleGuards(actor, flags);
  if (flags.last_role) throw new ConflictError(LAST_ROLE_ERROR);
  if (!flags.written) throw new ConflictError("The user's role changed; try again.");
}

function assertStatusChanged(actor: RequestAccess, flags: StatusFlags, conflictMessage: string): void {
  if (!flags.target_found) throw new NotFoundError("User does not exist.");
  if (flags.target_is_admin && !actor.isAdmin) throw new ForbiddenError(ADMIN_TARGET_ERROR);
  if (!flags.id) throw new ConflictError(conflictMessage);
}

function assertDeleted(actor: RequestAccess, flags: DeleteFlags): void {
  if (!flags.target_found) throw new NotFoundError("User does not exist.");
  if (flags.target_is_admin && !actor.isAdmin) throw new ForbiddenError(ADMIN_TARGET_ERROR);
  if (!flags.target_disabled || !flags.deleted) throw new ConflictError("Disable the user before deleting them.");
}

function assertInviteRoles(actor: RequestAccess, consoleRoleId: string | undefined, brandRoles: InviteBrandRole[]): void {
  if (!consoleRoleId && brandRoles.length === 0) throw new ValidationError("Assign at least one role.");
  if (consoleRoleId && !actor.consoleActions.includes("users.assignConsoleRoles")) {
    throw new ForbiddenError("You cannot assign console roles.");
  }
  if (brandRoles.length > 0 && !actor.consoleActions.includes("users.assignBrandRoles")) {
    throw new ForbiddenError("You cannot assign brand roles.");
  }
  // Postgres compares UUIDs case-insensitively, so this must too.
  const brandIds = new Set(brandRoles.map((pair) => pair.brandId.toLowerCase()));
  if (brandIds.size !== brandRoles.length) throw new ValidationError("Each brand can have only one role.");
}

function assertInviteGuards(actor: RequestAccess, flags: InviteFlags): void {
  if (!flags.console_role_found || !flags.brand_roles_found) throw new NotFoundError("Role not found.");
  if (!flags.brands_found) throw new NotFoundError("Brand not found.");
  if (actor.isAdmin) return;
  if (flags.console_role_builtin) throw new ForbiddenError("Only an Admin can assign the Admin role.");
  if (!flags.console_subset) throw new ForbiddenError("A console role can only hold console actions you hold.");
}

function toInviteError(error: unknown, email: string): Error | null {
  if (isUniqueViolationOf(error, "users_email_key")) return new ConflictError(`User ${email} already exists.`);
  if (isCheckViolationOf(error, "users_email_check")) return new ValidationError("Invalid email.");
  return null;
}

export async function listUsers(db: Queryable): Promise<UserRecordSchemaType[]> {
  const result = await db.query(`
    SELECT ${userRecordColumns("u", "r")}
    FROM users u
    LEFT JOIN user_console_roles ucr ON ucr.user_id = u.id
    LEFT JOIN roles r ON r.id = ucr.role_id
    ORDER BY u.email`);

  return result.rows.map(toUserRecord);
}

export async function inviteUser(
  db: Queryable,
  actor: RequestAccess,
  body: InviteUserBodySchemaType,
): Promise<UserRecordSchemaType> {
  assertValid(InviteUserBodySchema, body);
  const brandRoles = body.brandRoles ?? [];
  assertInviteRoles(actor, body.consoleRoleId, brandRoles);
  const email = body.email.toLowerCase();

  try {
    const result = await db.query(INVITE_USER_SQL, [
      email,
      body.displayName ?? null,
      staffNameSource(body.displayName),
      actor.user.id,
      body.consoleRoleId ?? null,
      brandRoles.map((pair) => pair.brandId),
      brandRoles.map((pair) => pair.roleId),
      actor.isAdmin,
      actor.consoleActions,
    ]);
    const row = result.rows[0];
    assertInviteGuards(actor, row);
    return toUserRecord(row);
  } catch (error) {
    throw toInviteError(error, email) ?? error;
  }
}

export async function updateUser(
  db: Queryable,
  actor: RequestAccess,
  userId: string,
  body: UpdateUserBodySchemaType,
): Promise<UserRecordSchemaType> {
  assertValid(UserParamsSchema, { userId });
  assertValid(UpdateUserBodySchema, body);
  const displayName = body.displayName?.trim() || null;

  const result = await db.query(UPDATE_USER_SQL, [userId, displayName, actor.isAdmin, staffNameSource(displayName)]);
  const row = result.rows[0];
  if (!row.target_found) throw new NotFoundError("User does not exist.");
  if (row.target_is_admin && !actor.isAdmin) throw new ForbiddenError(ADMIN_TARGET_ERROR);
  return toUserRecord(row);
}

export async function setConsoleRole(
  db: Queryable,
  actor: RequestAccess,
  userId: string,
  roleId: string,
): Promise<UserRecordSchemaType> {
  assertValid(UserParamsSchema, { userId });
  assertValid(SetConsoleRoleBodySchema, { roleId });
  assertNotSelf(actor, userId, OWN_CONSOLE_ROLE_ERROR);

  const result = await db.query(SET_CONSOLE_ROLE_SQL, [
    userId,
    roleId,
    actor.user.id,
    actor.isAdmin,
    actor.consoleActions,
  ]);
  const row = result.rows[0];
  assertConsoleRoleWritten(actor, row);
  return toUserRecord(row);
}

export async function clearConsoleRole(db: Queryable, actor: RequestAccess, userId: string): Promise<void> {
  assertValid(UserParamsSchema, { userId });
  assertNotSelf(actor, userId, OWN_CONSOLE_ROLE_ERROR);

  const result = await db.query(CLEAR_CONSOLE_ROLE_SQL, [userId, actor.isAdmin, actor.consoleActions]);
  assertConsoleRoleWritten(actor, result.rows[0]);
}

export async function disableUser(db: Queryable, actor: RequestAccess, userId: string): Promise<UserRecordSchemaType> {
  assertValid(UserParamsSchema, { userId });
  assertNotSelf(actor, userId, "You cannot disable yourself.");

  const result = await db.query(DISABLE_USER_SQL, [userId, actor.isAdmin]);
  const row = result.rows[0];
  assertStatusChanged(actor, row, "User is already disabled.");
  return toUserRecord(row);
}

export async function reinviteUser(db: Queryable, actor: RequestAccess, userId: string): Promise<UserRecordSchemaType> {
  assertValid(UserParamsSchema, { userId });

  const result = await db.query(REINVITE_USER_SQL, [userId, actor.isAdmin]);
  const row = result.rows[0];
  assertStatusChanged(actor, row, "Only a disabled user can be reinvited.");
  return toUserRecord(row);
}

export async function deleteUser(db: Queryable, actor: RequestAccess, userId: string): Promise<void> {
  assertValid(UserParamsSchema, { userId });
  assertNotSelf(actor, userId, "You cannot delete yourself.");

  const result = await db.query(DELETE_USER_SQL, [userId, actor.isAdmin]);
  assertDeleted(actor, result.rows[0]);
}
