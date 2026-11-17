import { getPool } from "@bonlift-ai/db";
import { Pool } from "pg";

// Keep in sync with SESSION_IDLE_MS in packages/api/src/services/session.service.ts.
const IDLE_TIMEOUT = "8 hours";

export async function deleteExpiredSessions(db: Pick<Pool, "query">): Promise<number> {
  const result = await db.query(
    `DELETE FROM user_sessions
     WHERE expires_at < now() OR last_seen_at < now() - $1::interval`,
    [IDLE_TIMEOUT],
  );
  return result.rowCount ?? 0;
}

export function processSessionCleanup(): Promise<number> {
  return deleteExpiredSessions(getPool());
}
