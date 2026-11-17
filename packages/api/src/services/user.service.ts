import {
  InviteUserBodySchema,
  SetConsoleRoleBodySchema,
  UpdateUserBodySchema,
  UserParamsSchema,
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

interface ConsoleRoleFlags {
  target_found: boolean;
  target_is_admin: boolean;
  current_subset: boolean;
  written: boolean;
  role_found?: boolean;
  role_builtin?: boolean;
  new_subset?: boolean;
}

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
  ${userAlias}.id, ${userAlias}.email, ${userAlias}.display_name, ${userAlias}.status, ${userAlias}.last_login_at,
  ${roleAlias}.id AS role_id, ${roleAlias}.name AS role_name, ${roleAlias}.is_builtin AS role_is_builtin,
  ${brandCountOf(userAlias)} AS brand_count`;

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

// $1 is the target user. With no console role, the current role is empty, so it is a subset.
const consoleTargetCte = (actionsParam: string) => `
  target AS (
    SELECT u.id, u.email, u.display_name, u.status, u.last_login_at,
           ucr.role_id AS current_role_id,
           COALESCE(cr.is_builtin, false) AS target_is_admin,
           ${isSubsetOf("ucr.role_id", actionsParam)} AS current_subset
    FROM users u
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
  WITH ${consoleTargetCte("$3")},
  cleared AS (
    DELETE FROM user_console_roles ucr
    USING target t
    WHERE ucr.user_id = t.id
      AND ($2::boolean OR (NOT t.target_is_admin AND t.current_subset))
      AND ${lockedRoleWithin("ucr.role_id", "$2", "$3")}
    RETURNING ucr.user_id
  )
  SELECT
    t.id IS NOT NULL AS target_found,
    COALESCE(t.target_is_admin, false) AS target_is_admin,
    COALESCE(t.current_subset, false) AS current_subset,
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
    RETURNING u.id, u.email, u.display_name, u.status, u.last_login_at
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

// $1 is the target, $2 the new name (NULL clears it), $3 whether the actor is an Admin.
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
    SET display_name = $2, updated_at = now()
    FROM target t
    WHERE u.id = t.id
      AND ($3::boolean OR NOT t.target_is_admin)
    RETURNING u.id, u.email, u.display_name, u.status, u.last_login_at
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

function toUserRecord(row: any): UserRecordSchemaType {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
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

export async function inviteUser(db: Queryable, body: InviteUserBodySchemaType): Promise<UserRecordSchemaType> {
  assertValid(InviteUserBodySchema, body);
  const email = body.email.toLowerCase();

  try {
    const result = await db.query(
      `
      INSERT INTO users (email, display_name) VALUES ($1, $2)
      RETURNING id, email, display_name, status, last_login_at`,
      [email, body.displayName ?? null],
    );
    return toUserRecord(result.rows[0]);
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

  const result = await db.query(UPDATE_USER_SQL, [userId, displayName, actor.isAdmin]);
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
