import { describe, expect, it } from "vitest";
import { getTestPool } from "../testing/testDb.js";
import { createTenant, getTenant } from "./tenant.service.js";

describe("tenant.service (integration)", () => {
  it("creates a tenant and reads it back from Postgres", async () => {
    const pool = getTestPool();

    const created = await createTenant(pool, { name: "Acme Foods" });

    expect(created).toMatchObject({ name: "Acme Foods", isActive: true });
    await expect(getTenant(pool, created.id)).resolves.toEqual(created);
  });
});
