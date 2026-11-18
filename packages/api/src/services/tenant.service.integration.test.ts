import { BRAND_ACTIONS } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { getTestPool } from "../testing/testDb.js";
import { createBrand } from "./brand.service.js";
import { createTenant, getTenant } from "./tenant.service.js";

describe("tenant.service (integration)", () => {
  it("creates a tenant and reads it back from Postgres", async () => {
    const pool = getTestPool();

    const created = await createTenant(pool, { name: "Acme Foods" });

    expect(created).toMatchObject({ name: "Acme Foods", isActive: true });
    await expect(getTenant(pool, created.id)).resolves.toEqual(created);
  });

  it("creates the tenant's built-in Brand Owner holding every brand action", async () => {
    const pool = getTestPool();

    const created = await createTenant(pool, { name: "Acme Foods" });

    const result = await pool.query(
      `
      SELECT r.name, r.kind, r.is_builtin,
             ARRAY(SELECT rp.action FROM role_permissions rp WHERE rp.role_id = r.id) AS actions
      FROM roles r
      WHERE r.tenant_id = $1`,
      [created.id],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: "Brand Owner", kind: "brand", is_builtin: true });
    expect([...result.rows[0].actions].sort()).toStrictEqual([...BRAND_ACTIONS].sort());
  });

  it("gives each tenant its own Brand Owner", async () => {
    const pool = getTestPool();

    await createTenant(pool, { name: "Acme Foods" });
    await createTenant(pool, { name: "Kopi Group" });

    const result = await pool.query(
      `SELECT count(DISTINCT tenant_id)::int AS tenants FROM roles WHERE kind = 'brand' AND is_builtin AND name = 'Brand Owner'`,
    );
    expect(result.rows[0].tenants).toBe(2);
  });

  it("refuses one tenant's role on another tenant's brand", async () => {
    const pool = getTestPool();
    const acme = await createTenant(pool, { name: "Acme Foods" });
    const kopi = await createTenant(pool, { name: "Kopi Group" });
    const kopiBrand = await createBrand(pool, { tenantId: kopi.id, name: "Kopi House" });
    const user = await pool.query(`INSERT INTO users (email) VALUES ('alice@x.com') RETURNING id`);
    const assign = (tenantId: string) =>
      pool.query(
        `
        INSERT INTO user_brand_roles (user_id, brand_id, tenant_id, role_id)
        SELECT $1, $2, $3, r.id FROM roles r WHERE r.tenant_id = $4 AND r.is_builtin`,
        [user.rows[0].id, kopiBrand.id, tenantId, acme.id],
      );

    await expect(assign(kopi.id)).rejects.toMatchObject({ constraint: "user_brand_roles_role_fkey" });
    await expect(assign(acme.id)).rejects.toMatchObject({ constraint: "user_brand_roles_tenant_brand_fkey" });
  });
});
