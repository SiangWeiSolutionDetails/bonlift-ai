import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Values already set in the shell (e.g. CI) win over .env.test.
process.loadEnvFile(fileURLToPath(new URL(".env.test", import.meta.url)));

// App code reads DATABASE_URL via getPool(), so point it at the test database before any test imports it.
function useTestDatabaseForApp(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set");
  }
  const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against database "${databaseName}": name must end with "_test".`,
    );
  }
  process.env.DATABASE_URL = url;
  // Unreachable on purpose: a shell REDIS_URL must never let tests enqueue jobs for the dev worker.
  process.env.REDIS_URL = "redis://127.0.0.1:1";
}

useTestDatabaseForApp();

export default defineConfig({
  test: {
    include: ["packages/**/*.integration.test.ts"],
    exclude: [...configDefaults.exclude, "**/dist/**"],
    setupFiles: ["packages/api/src/testing/integrationSetup.ts"],
    // One shared database: run files one at a time in a single process.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
