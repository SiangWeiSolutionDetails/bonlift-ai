import { afterAll, beforeEach } from "vitest";
import { closeTestPool, resetTestDb } from "./testDb.js";

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestPool();
});
