import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import { createBrand, deleteBrand } from "./brand.service.js";
import { createSession } from "./session.service.js";
import { createTenant } from "./tenant.service.js";
import { updateUser } from "./user.service.js";
import { findSessionUserAccess, updateOwnName } from "./userAccess.service.js";

async function signedInUser(
  name: string | null = null,
  source: string | null = null,
): Promise<{ userId: string; token: string }> {
  const pool = getTestPool();
  const result = await pool.query(
    `INSERT INTO users (email, status, display_name, display_name_source)
     VALUES ('alice@x.com', 'active', $1, $2) RETURNING id`,
    [name, source],
  );
  const userId = result.rows[0].id;
  return { userId, token: await createSession(pool, userId, "google", null) };
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

async function brandIn(tenantId: string, brandName: string): Promise<string> {
  return (await createBrand(getTestPool(), { tenantId, name: brandName })).id;
}

async function tenantNamed(name: string): Promise<string> {
  return (await createTenant(getTestPool(), { name })).id;
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

describe("findSessionUserAccess (integration)", () => {
  it("returns no console role and no brands for a user without roles", async () => {
    const { token } = await signedInUser();

    expect(await findSessionUserAccess(getTestPool(), token)).toMatchObject({ console: null, brands: [] });
  });

  it("gives an Admin every console action", async () => {
    const { userId, token } = await signedInUser();
    const roleId = await createRole("console", "Admin", [], true);
    await getTestPool().query(`INSERT INTO user_console_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);

    const result = await findSessionUserAccess(getTestPool(), token);

    expect(result?.console).toEqual({ roleId, roleName: "Admin", isAdmin: true, actions: [...CONSOLE_ACTIONS] });
  });

  it("lists live brands by tenant then brand name, drops stale keys and keeps empty roles", async () => {
    const { userId, token } = await signedInUser();
    const [zeta, alpha, gamma] = [await tenantNamed("Zeta Group"), await tenantNamed("Alpha Group"), await tenantNamed("Gamma Group")];
    const zetaBrand = await brandIn(zeta, "Alpha");
    const alphaB = await brandIn(alpha, "Beta");
    const alphaA = await brandIn(alpha, "Alpha");
    const deleted = await brandIn(gamma, "Gone");
    const viewerOn = (brandId: string) => createBrandRole(brandId, "Viewer", ["apiKeys.view", "gone.action"]);
    const alphaViewer = await viewerOn(alphaA);
    await assignBrandRole(userId, zetaBrand, await viewerOn(zetaBrand));
    await assignBrandRole(userId, alphaB, await createBrandRole(alphaB, "Empty", []));
    await assignBrandRole(userId, alphaA, alphaViewer);
    await assignBrandRole(userId, deleted, await viewerOn(deleted));
    await deleteBrand(getTestPool(), deleted);

    const result = await findSessionUserAccess(getTestPool(), token);

    expect(result?.brands.map((b) => [b.tenantName, b.brandName, b.actions])).toEqual([
      ["Alpha Group", "Alpha", ["apiKeys.view"]],
      ["Alpha Group", "Beta", []],
      ["Zeta Group", "Alpha", ["apiKeys.view"]],
    ]);
  });

  it("returns the provider that signed in this session", async () => {
    const { userId } = await signedInUser();
    const token = await createSession(getTestPool(), userId, "microsoft", null);

    expect(await findSessionUserAccess(getTestPool(), token)).toMatchObject({ provider: "microsoft" });
  });

  it("returns null for an unknown session", async () => {
    expect(await findSessionUserAccess(getTestPool(), "a".repeat(43))).toBeNull();
  });
});

async function nameOf(userId: string) {
  const result = await getTestPool().query(`SELECT display_name, display_name_source FROM users WHERE id = $1`, [
    userId,
  ]);
  return result.rows[0];
}

describe("name flags on /auth/me (integration)", () => {
  it("asks a user with a Google name to confirm it", async () => {
    const { token } = await signedInUser("Alice G", "provider");

    expect(await findSessionUserAccess(getTestPool(), token)).toMatchObject({
      displayName: "Alice G",
      nameLocked: false,
      needsNameConfirmation: true,
    });
  });

  it("locks a staff name and does not ask to confirm it", async () => {
    const { token } = await signedInUser("Alice", "staff");

    expect(await findSessionUserAccess(getTestPool(), token)).toMatchObject({
      nameLocked: true,
      needsNameConfirmation: false,
    });
  });
});

describe("updateOwnName (integration)", () => {
  it("sets a Google name as chosen by the user and returns the /auth/me shape", async () => {
    const { userId, token } = await signedInUser("Alice G", "provider");

    const result = await updateOwnName(getTestPool(), token, { displayName: "  Alice Tan " });

    expect(result).toMatchObject({
      id: userId,
      displayName: "Alice Tan",
      provider: "google",
      nameLocked: false,
      needsNameConfirmation: false,
      console: null,
      brands: [],
    });
    expect(await nameOf(userId)).toEqual({ display_name: "Alice Tan", display_name_source: "self" });
  });

  it("sets a name for a user who has none", async () => {
    const { userId, token } = await signedInUser();

    await updateOwnName(getTestPool(), token, { displayName: "Alice" });

    expect(await nameOf(userId)).toEqual({ display_name: "Alice", display_name_source: "self" });
  });

  it("lets a user change a name they chose before", async () => {
    const { userId, token } = await signedInUser("Alice", "self");

    await updateOwnName(getTestPool(), token, { displayName: "Ally" });

    expect(await nameOf(userId)).toEqual({ display_name: "Ally", display_name_source: "self" });
  });

  it("refuses a staff name with 403 and writes nothing", async () => {
    const { userId, token } = await signedInUser("Alice", "staff");

    await expect(updateOwnName(getTestPool(), token, { displayName: "Hacked" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    expect(await nameOf(userId)).toEqual({ display_name: "Alice", display_name_source: "staff" });
  });

  it("allows a change once staff clear the name", async () => {
    const { userId, token } = await signedInUser("Alice", "staff");
    const admin = { user: { id: userId, email: "alice@x.com", displayName: null }, isAdmin: true, consoleActions: [] };
    await updateUser(getTestPool(), admin, userId, { displayName: null });

    const result = await updateOwnName(getTestPool(), token, { displayName: "Ally" });

    expect(result).toMatchObject({ displayName: "Ally", nameLocked: false });
    expect(await nameOf(userId)).toEqual({ display_name: "Ally", display_name_source: "self" });
  });

  it("refuses an unknown session", async () => {
    await expect(updateOwnName(getTestPool(), "a".repeat(43), { displayName: "Alice" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
