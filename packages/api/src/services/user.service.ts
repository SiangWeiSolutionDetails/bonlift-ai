import type { Pool, PoolClient } from "pg";
import { AccountNotApprovedError } from "../errors.js";
import { isUniqueViolationOf } from "../utils/pgErrors.js";
import { withTransaction } from "../utils/transaction.js";
import type { SessionUser } from "./session.service.js";

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
