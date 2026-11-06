import { Pool } from "pg";

const MIGRATIONS_TABLE = "pgmigrations";

let pool: Pool | undefined;
let truncateSql: string | undefined;

function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set");
  }
  return url;
}

// Guard against wiping a real database: TRUNCATE runs before every integration test.
function assertTestDatabase(url: string): void {
  const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to use database "${databaseName}" for integration tests: name must end with "_test".`,
    );
  }
}

export function getTestPool(): Pool {
  if (!pool) {
    const url = getTestDatabaseUrl();
    assertTestDatabase(url);
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

async function buildTruncateSql(db: Pool): Promise<string | undefined> {
  const result = await db.query(
    `
    SELECT format('%I.%I', schemaname, tablename) AS name
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> $1`,
    [MIGRATIONS_TABLE],
  );

  if (result.rows.length === 0) {
    return undefined;
  }

  const tables = result.rows.map((row) => row.name).join(", ");
  return `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`;
}

export async function resetTestDb(): Promise<void> {
  const db = getTestPool();
  // Schema is fixed for the whole run, so the table list is looked up once per worker.
  truncateSql ??= await buildTruncateSql(db);
  if (truncateSql) {
    await db.query(truncateSql);
  }
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    truncateSql = undefined;
  }
}
