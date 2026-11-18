import { describe, expect, it } from "vitest";
import { getTestPool } from "../testing/testDb.js";
import { authorizeRequest } from "./authorization.service.js";
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

  it("gives an Admin every console action but returns notFound for a brand action", async () => {
    const brandId = await createTestBrand();
    const { userId, token } = await createSignedInUser();
    await assignConsoleRole(userId, await createRole("console", "Admin", [], true));

    const consoleResult = await authorizeRequest(getTestPool(), token, { console: "roles.manage" }, {});
    const brandResult = await authorizeRequest(
      getTestPool(),
      token,
      { brand: "apiKeys.view", from: "params.brandId" },
      { "params.brandId": brandId },
    );

    expect(consoleResult).toMatchObject({ decision: "allow", access: { isAdmin: true } });
    expect(brandResult).toMatchObject({ decision: "notFound", access: { isAdmin: true } });
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
      { brandMember: "params.brandId" },
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
