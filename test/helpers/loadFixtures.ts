import type { Pool } from "pg";

/** Runs arbitrary fixture SQL (INSERTs) against the test database inside a transaction-per-call. */
export async function loadFixtures(pool: Pool, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Truncates all module 1 tables — call in beforeEach/afterEach to isolate tests from each other. */
export async function resetTestData(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE outlet_item_scores, order_lines, orders, customers, outlets, brands RESTART IDENTITY CASCADE`
  );
}
