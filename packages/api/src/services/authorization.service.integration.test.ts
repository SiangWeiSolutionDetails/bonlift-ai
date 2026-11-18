import type { BrandAction } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { getTestPool } from "../testing/testDb.js";
import { authorizeRequest, type AccessCheck, type BrandRef } from "./authorization.service.js";
import { createBrand, deleteBrand } from "./brand.service.js";
import { createOutlet } from "./outlet.service.js";
import { createSession, SESSION_IDLE_MS } from "./session.service.js";
import { createTenant } from "./tenant.service.js";

async function createTestBrand(name = "Kopi House"): Promise<string> {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: `${name} Group` });
  return (await createBrand(pool, { tenantId: tenant.id, name })).id;
}

async function createSignedInUser(email = "alice@x.com"): Promise<{ userId: string; token: string }> {
  const pool = getTestPool();
  const result = await pool.query(`INSERT INTO users (email, status) VALUES ($1, 'active') RETURNING id`, [email]);
  const userId = result.rows[0].id;
  return { userId, token: await createSession(pool, userId, null) };
}

async function createRole(kind: "console" | "brand", name: string, actions: string[], isBuiltin = false) {
  const result = await getTestPool().query(
    `
    WITH role AS (
      INSERT INTO roles (name, kind, is_builtin) VALUES ($1, $2, $3) RETURNING id
    ),
    perms AS (
      INSERT INTO role_permissions (role_id, action)
      SELECT role.id, a.action FROM role, unnest($4::text[]) AS a(action)
    )
    SELECT id FROM role
    `,
    [name, kind, isBuiltin, actions],
  );
  return result.rows[0].id as string;
}

async function assignConsoleRole(userId: string, roleId: string) {
  await getTestPool().query(`INSERT INTO user_console_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);
}

async function assignBrandRole(userId: string, brandId: string, roleId: string) {
  await getTestPool().query(
    `
    INSERT INTO user_brand_roles (user_id, brand_id, tenant_id, role_id)
    SELECT $1, b.id, b.tenant_id, $3 FROM brands b WHERE b.id = $2`,
    [userId, brandId, roleId],
  );
}

async function createBrandRole(brandId: string, name: string, actions: string[]) {
  const result = await getTestPool().query(
    `
    WITH role AS (
      INSERT INTO roles (name, kind, tenant_id)
      SELECT $1, 'brand', b.tenant_id FROM brands b WHERE b.id = $2
      RETURNING id
    ),
    perms AS (
      INSERT INTO role_permissions (role_id, action)
      SELECT role.id, a.action FROM role, unnest($3::text[]) AS a(action)
    )
    SELECT id FROM role
    `,
    [name, brandId, actions],
  );
  return result.rows[0].id as string;
}

async function insertRun(brandId: string): Promise<string> {
  const result = await getTestPool().query(
    `
    INSERT INTO computation_runs (
      brand_id, job_type, run_date, algorithm_version, calculation_config_version_id,
      input_window_from, input_window_to, trigger_type, triggered_by, status
    )
    SELECT $1, v.job_type, current_date, 'test', v.id, current_date - 7, current_date - 1, 'manual', 'test', 'running'
    FROM calculation_config_versions v
    WHERE v.brand_id = $1
      AND v.job_type = 'customer_item_scores'
    ORDER BY v.version DESC
    LIMIT 1
    RETURNING id
    `,
    [brandId],
  );
  return result.rows[0].id;
}

describe("authorization.service (integration)", () => {
  it("returns notFound for a brand action without a role on the brand", async () => {
    const brandId = await createTestBrand();
    const { token } = await createSignedInUser();

    const result = await authorizeRequest(
      getTestPool(),
      token,
      { brand: "apiKeys.view", from: "params.brandId" },
      { "params.brandId": brandId },
    );

    expect(result).toMatchObject({ decision: "notFound", brandActions: null });
  });

  it("forbids a brand action the brand role lacks and lists the actions it holds", async () => {
    const brandId = await createTestBrand();
    const { userId, token } = await createSignedInUser();
    await assignBrandRole(userId, brandId, await createBrandRole(brandId, "Viewer", ["apiKeys.view", "gone.action"]));

    const result = await authorizeRequest(
      getTestPool(),
      token,
      { brand: "apiKeys.revoke", from: "params.brandId" },
      { "params.brandId": brandId },
    );

    expect(result).toMatchObject({ decision: "forbidden", brandActions: ["apiKeys.view"] });
  });

  it("allows a console action and returns the user", async () => {
    const { userId, token } = await createSignedInUser();
    await assignConsoleRole(userId, await createRole("console", "Support", ["tenants.view"]));

    const result = await authorizeRequest(getTestPool(), token, { console: "tenants.view" }, {});

    expect(result).toEqual({
      access: {
        user: { id: userId, email: "alice@x.com", displayName: null },
        isAdmin: false,
        consoleActions: ["tenants.view"],
      },
      brandActions: null,
      decision: "allow",
    });
  });

  it("gives an Admin every console action and provider access to a brand without personal data", async () => {
    const brandId = await createTestBrand();
    const { userId, token } = await createSignedInUser();
    await assignConsoleRole(userId, await createRole("console", "Admin", [], true));
    const onBrand = (action: BrandAction) =>
      authorizeRequest(getTestPool(), token, { brand: action, from: "params.brandId" }, { "params.brandId": brandId });

    const consoleResult = await authorizeRequest(getTestPool(), token, { console: "roles.manage" }, {});

    expect(consoleResult).toMatchObject({ decision: "allow", access: { isAdmin: true } });
    expect(await onBrand("apiKeys.view")).toMatchObject({ decision: "allow", brandActions: null });
    expect(await onBrand("customerScores.view")).toMatchObject({ decision: "forbidden" });
  });

  describe("provider access", () => {
    async function createProvider(actions: string[]) {
      const { userId, token } = await createSignedInUser("provider@x.com");
      await assignConsoleRole(userId, await createRole("console", "Provider", actions));
      return token;
    }

    async function createBrandWithRunAndOutlet() {
      const brandId = await createTestBrand();
      const outletId = (await createOutlet(getTestPool(), { brandId, name: "Orchard" })).id;
      return { brandId, outletId, runId: await insertRun(brandId) };
    }

    it("lets provider.view reach an operational route but not edit or see personal data", async () => {
      const { brandId, outletId, runId } = await createBrandWithRunAndOutlet();
      const token = await createProvider(["provider.view"]);
      const decisionOf = async (access: AccessCheck, refs: Partial<Record<BrandRef, string>>) =>
        (await authorizeRequest(getTestPool(), token, access, refs))?.decision;

      expect(await decisionOf({ brand: "outlets.view", from: "params.outletId" }, { "params.outletId": outletId })).toBe(
        "allow",
      );
      expect(await decisionOf({ brandUser: "params.brandId" }, { "params.brandId": brandId })).toBe("allow");
      expect(await decisionOf({ brand: "outlets.edit", from: "params.outletId" }, { "params.outletId": outletId })).toBe(
        "forbidden",
      );
      expect(
        await decisionOf({ brand: "customerScores.view", from: "params.runId" }, { "params.runId": runId }),
      ).toBe("forbidden");
      expect(
        await decisionOf({ brand: "snapshots.viewCustomerIds", from: "params.outletId" }, { "params.outletId": outletId }),
      ).toBe("forbidden");
    });

    it("lets provider.support edit but still not see personal data", async () => {
      const { outletId, runId } = await createBrandWithRunAndOutlet();
      const token = await createProvider(["provider.support"]);
      const decisionOf = async (access: AccessCheck, refs: Partial<Record<BrandRef, string>>) =>
        (await authorizeRequest(getTestPool(), token, access, refs))?.decision;

      expect(await decisionOf({ brand: "outlets.edit", from: "params.outletId" }, { "params.outletId": outletId })).toBe(
        "allow",
      );
      expect(
        await decisionOf({ brand: "calculations.trigger", from: "params.runId" }, { "params.runId": runId }),
      ).toBe("allow");
      expect(
        await decisionOf({ brand: "customerScores.view", from: "params.runId" }, { "params.runId": runId }),
      ).toBe("forbidden");
    });

    it("returns notFound to a provider for a brand that does not exist", async () => {
      const token = await createProvider(["provider.support"]);

      const result = await authorizeRequest(
        getTestPool(),
        token,
        { brand: "outlets.view", from: "params.brandId" },
        { "params.brandId": "99999999-9999-4999-8999-999999999999" },
      );

      expect(result?.decision).toBe("notFound");
    });

    it("gives no access to a brand of a deleted tenant, through a provider action or a brand role", async () => {
      const { brandId, outletId } = await createBrandWithRunAndOutlet();
      const token = await createProvider(["provider.support"]);
      const brandUser = await createSignedInUser("brand-user@x.com");
      await assignBrandRole(brandUser.userId, brandId, await createBrandRole(brandId, "Viewer", ["outlets.view"]));
      // Only the tenant row, so the brand-resolution tenant check is what refuses.
      await getTestPool().query(
        `UPDATE tenants SET deleted_at = now() WHERE id = (SELECT tenant_id FROM brands WHERE id = $1)`,
        [brandId],
      );

      const provider = await authorizeRequest(
        getTestPool(),
        token,
        { brand: "outlets.view", from: "params.outletId" },
        { "params.outletId": outletId },
      );
      const viaRole = await authorizeRequest(
        getTestPool(),
        brandUser.token,
        { brandUser: "params.brandId" },
        { "params.brandId": brandId },
      );

      expect(provider?.decision).toBe("notFound");
      expect(viaRole).toMatchObject({ decision: "notFound", brandActions: null });
    });
  });

  it("resolves the brand through an outlet", async () => {
    const brandId = await createTestBrand();
    const otherBrandId = await createTestBrand("Teh Tarik");
    const outletId = (await createOutlet(getTestPool(), { brandId, name: "Orchard" })).id;
    const otherOutletId = (await createOutlet(getTestPool(), { brandId: otherBrandId, name: "Bugis" })).id;
    const { userId, token } = await createSignedInUser();
    await assignBrandRole(userId, brandId, await createBrandRole(brandId, "Viewer", ["outlets.view"]));
    const access = { brand: "outlets.view", from: "params.outletId" } as const;

    const own = await authorizeRequest(getTestPool(), token, access, { "params.outletId": outletId });
    const other = await authorizeRequest(getTestPool(), token, access, { "params.outletId": otherOutletId });

    expect(own?.decision).toBe("allow");
    expect(other?.decision).toBe("notFound");
  });

  it("resolves the brand through a run", async () => {
    const brandId = await createTestBrand();
    const otherBrandId = await createTestBrand("Teh Tarik");
    const runId = await insertRun(brandId);
    const otherRunId = await insertRun(otherBrandId);
    const { userId, token } = await createSignedInUser();
    await assignBrandRole(userId, brandId, await createBrandRole(brandId, "Analyst", ["customerScores.view"]));
    const access = { brand: "customerScores.view", from: "params.runId" } as const;

    const own = await authorizeRequest(getTestPool(), token, access, { "params.runId": runId });
    const other = await authorizeRequest(getTestPool(), token, access, { "params.runId": otherRunId });

    expect(own?.decision).toBe("allow");
    expect(other?.decision).toBe("notFound");
  });

  it("returns notFound for a soft-deleted brand despite a role on it", async () => {
    const brandId = await createTestBrand();
    const { userId, token } = await createSignedInUser();
    await assignBrandRole(userId, brandId, await createBrandRole(brandId, "Owner", ["outlets.view"]));
    await deleteBrand(getTestPool(), brandId);

    const result = await authorizeRequest(
      getTestPool(),
      token,
      { brandUser: "params.brandId" },
      { "params.brandId": brandId },
    );

    expect(result).toMatchObject({ decision: "notFound", brandActions: null });
  });

  it("returns null for an idle-expired session", async () => {
    const { token } = await createSignedInUser();
    await getTestPool().query(
      `UPDATE user_sessions SET last_seen_at = now() - make_interval(secs => $1::double precision / 1000 + 60)`,
      [SESSION_IDLE_MS],
    );

    expect(await authorizeRequest(getTestPool(), token, "signedIn", {})).toBeNull();
  });
});
