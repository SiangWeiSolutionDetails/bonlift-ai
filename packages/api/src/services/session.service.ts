import { createHash, randomBytes } from "node:crypto";
import { Pool, PoolClient } from "pg";

export const SESSION_ABSOLUTE_MS = 7 * 24 * 3600_000;
export const SESSION_IDLE_MS = 8 * 3600_000;
export const SESSION_TOUCH_MS = 5 * 60_000;
const USER_AGENT_MAX_LENGTH = 512;

// 32 random bytes as base64url, no padding.
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type Queryable = Pick<Pool, "query"> | PoolClient;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

export function createSessionToken(): { token: string; idHash: Buffer } {
  const token = randomBytes(32).toString("base64url");
  return { token, idHash: sha256(token) };
}

export function hashSessionToken(token: string): Buffer | null {
  return SESSION_TOKEN_PATTERN.test(token) ? sha256(token) : null;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export async function createSession(
  db: Queryable,
  userId: string,
  userAgent: string | null,
): Promise<string> {
  const { token, idHash } = createSessionToken();
  await db.query(
    `
    INSERT INTO user_sessions (id_hash, user_id, expires_at, user_agent)
    VALUES ($1, $2, now() + make_interval(secs => $3::double precision / 1000), $4)
    `,
    [idHash, userId, SESSION_ABSOLUTE_MS, userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null],
  );
  return token;
}

// One statement: s holds the session only if it is live (user active, inside both the absolute and idle limits);
// touched refreshes last_seen_at from s only when it is older than the touch interval, so most reads stay reads.
export async function findSessionUser(
  db: Queryable,
  token: string,
): Promise<SessionUser | null> {
  const idHash = hashSessionToken(token);
  if (!idHash) return null;

  const result = await db.query(
    `
    WITH s AS (
      SELECT us.id_hash, us.last_seen_at, u.id, u.email, u.display_name
      FROM user_sessions us
      JOIN users u
        ON u.id = us.user_id
      WHERE us.id_hash = $1
        AND u.status = 'active'
        AND us.expires_at > now()
        AND us.last_seen_at > now() - make_interval(secs => $2::double precision / 1000)
    ),
    touched AS (
      UPDATE user_sessions us
      SET last_seen_at = now()
      FROM s
      WHERE us.id_hash = s.id_hash
        AND s.last_seen_at < now() - make_interval(secs => $3::double precision / 1000)
    )
    SELECT s.id, s.email, s.display_name
    FROM s
    `,
    [idHash, SESSION_IDLE_MS, SESSION_TOUCH_MS],
  );

  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  const idHash = hashSessionToken(token);
  if (!idHash) return;

  await db.query(`DELETE FROM user_sessions WHERE id_hash = $1`, [idHash]);
}
