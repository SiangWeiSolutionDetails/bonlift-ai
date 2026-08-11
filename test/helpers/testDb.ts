import { Pool } from "pg";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://ai_services:ai_services@localhost:5433/ai_services_test";

let pool: Pool | undefined;

export function getTestPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
  }
  return pool;
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
