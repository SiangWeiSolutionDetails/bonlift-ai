import { CONSOLE_ACTIONS, type BrandAction } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import type { RequestAccess } from "./authorization.service.js";
import { createBrand } from "./brand.service.js";
import {
  createBrandRole,
  deleteBrandRole,
  listBrandRoleAssignments,
  listBrandRoles,
  updateBrandRole,
} from "./brandRole.service.js";
import { createTenant } from "./tenant.service.js";

async function userNamed(email: string): Promise<string> {
  const result = await getTestPool().query(`INSERT INTO users (email, status) VALUES ($1, 'active') RETURNING id`, [
    email,
  ]);
  return result.rows[0].id;
}

async function actorWith(
  email: string,
  consoleActions: RequestAccess["consoleActions"],
  isAdmin = false,
): Promise<RequestAccess> {
  const id = await userNamed(email);
  return { user: { id, email, displayName: null }, isAdmin, consoleActions };
}

const adminFor = (email: string) => actorWith(email, [...CONSOLE_ACTIONS], true);
const supportFor = (email: string) => actorWith(email, ["provider.support"]);
const merchantFor = (email: string) => actorWith(email, []);

async function insertBrandRole(tenantId: string, name: string, actions: string[]): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH role AS (
      INSERT INTO roles (name, kind, tenant_id) VALUES ($1, 'brand', $2) RETURNING id
    ),
    perms AS (
      INSERT INTO role_permissions (role_id, action)
      SELECT role.id, a.action FROM role, unnest($3::text[]) AS a(action)
    )
    SELECT id FROM role`,
    [name, tenantId, actions],
  );
  return result.rows[0].id;
}

async function brandOwnerOf(tenantId: string): Promise<string> {
  const result = await getTestPool().query(
    `SELECT id FROM roles WHERE tenant_id = $1 AND kind = 'brand' AND is_builtin`,
    [tenantId],
  );
  return result.rows[0].id;
}

async function storedRole(roleId: string) {
  const result = await getTestPool().query(
    `
    SELECT r.name, r.tenant_id,
           ARRAY(SELECT rp.action FROM role_permissions rp WHERE rp.role_id = r.id ORDER BY rp.action) AS actions
    FROM roles r
    WHERE r.id = $1`,
    [roleId],
  );
  return result.rows[0] ?? null;
}

async function assignBrandRole(userId: string, brandId: string, roleId: string) {
  await getTestPool().query(
    `
    INSERT INTO user_brand_roles (user_id, brand_id, tenant_id, role_id)
    SELECT $1, b.id, b.tenant_id, $3 FROM brands b WHERE b.id = $2`,
    [userId, brandId, roleId],
  );
}

async function tenantWithBrands(name: string, ...brandNames: string[]) {
  const tenantId = (await createTenant(getTestPool(), { name })).id;
  const brandIds: string[] = [];
  for (const brandName of brandNames) {
    brandIds.push((await createBrand(getTestPool(), { tenantId, name: brandName })).id);
  }
  return { tenantId, brandIds };
}

const MANAGER_ACTIONS: BrandAction[] = ["brandRoles.view", "brandRoles.manage", "brandUsers.view", "outlets.view"];

// A merchant manager holding MANAGER_ACTIONS on the brand, as the request's brandActions would carry them.
async function managerOn(email: string, tenantId: string, brandId: string) {
  const actor = await merchantFor(email);
  await assignBrandRole(actor.user.id, brandId, await insertBrandRole(tenantId, `${email} role`, MANAGER_ACTIONS));
  return actor;
}

describe("tenant isolation (integration)", () => {
  it("lists only the brand's own tenant roles", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const beta = await tenantWithBrands("Beta Group", "Beta");
    await insertBrandRole(alpha.tenantId, "Alpha Analyst", ["results.view"]);
    await insertBrandRole(beta.tenantId, "Beta Analyst", ["results.view"]);

    const roles = await listBrandRoles(getTestPool(), alpha.brandIds[0]);

    expect(roles.map((role) => role.name)).toEqual(["Alpha Analyst", "Brand Owner"]);
    expect(roles.find((role) => role.name === "Brand Owner")).toMatchObject({ kind: "brand", isBuiltin: true });
  });

  it("treats another tenant's role as missing on edit, delete and assignments, and writes nothing", async () => {
    const admin = await adminFor("admin@x.com");
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const beta = await tenantWithBrands("Beta Group", "Beta");
    const betaRoleId = await insertBrandRole(beta.tenantId, "Beta Analyst", ["results.view"]);
    const alphaBrandId = alpha.brandIds[0];

    await expect(
      updateBrandRole(getTestPool(), admin, null, alphaBrandId, betaRoleId, { name: "Hijacked", actions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteBrandRole(getTestPool(), admin, null, alphaBrandId, betaRoleId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      listBrandRoleAssignments(getTestPool(), admin, null, alphaBrandId, betaRoleId),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await storedRole(betaRoleId)).toEqual({
      name: "Beta Analyst",
      tenant_id: beta.tenantId,
      actions: ["results.view"],
    });
  });

  it("creates the role in the brand's tenant, and allows the same name in another tenant", async () => {
    const admin = await adminFor("admin@x.com");
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const beta = await tenantWithBrands("Beta Group", "Beta");
    await insertBrandRole(beta.tenantId, "Analyst", ["results.view"]);

    const role = await createBrandRole(getTestPool(), admin, null, alpha.brandIds[0], {
      name: "Analyst",
      actions: ["results.view"],
    });

    expect(await storedRole(role.id)).toEqual({ name: "Analyst", tenant_id: alpha.tenantId, actions: ["results.view"] });
    expect((await listBrandRoles(getTestPool(), beta.brandIds[0])).map((r) => r.id)).not.toContain(role.id);
  });

  it("returns 404 on a soft-deleted brand", async () => {
    const admin = await adminFor("admin@x.com");
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    await getTestPool().query(`UPDATE brands SET deleted_at = now() WHERE id = $1`, [alpha.brandIds[0]]);

    await expect(listBrandRoles(getTestPool(), alpha.brandIds[0])).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createBrandRole(getTestPool(), admin, null, alpha.brandIds[0], { name: "Analyst", actions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns 409 for a duplicate name within the tenant", async () => {
    const admin = await adminFor("admin@x.com");
    const alpha = await tenantWithBrands("Alpha Group", "Alpha", "Bravo");
    await insertBrandRole(alpha.tenantId, "Analyst", ["results.view"]);

    await expect(
      createBrandRole(getTestPool(), admin, null, alpha.brandIds[1], { name: "analyst", actions: [] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("self-held roles (integration)", () => {
  it("refuses editing or deleting a role the actor holds on another brand of the tenant", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha", "Bravo");
    const actor = await managerOn("lead@x.com", alpha.tenantId, alpha.brandIds[0]);
    const roleId = await insertBrandRole(alpha.tenantId, "Reader", ["outlets.view"]);
    await assignBrandRole(actor.user.id, alpha.brandIds[1], roleId);

    await expect(
      updateBrandRole(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], roleId, {
        actions: ["outlets.view", "brandRoles.manage"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      deleteBrandRole(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], roleId),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toMatchObject({ name: "Reader", actions: ["outlets.view"] });
  });

  it("refuses provider support editing a role they also hold through a brand role", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const actor = await supportFor("support@x.com");
    const roleId = await insertBrandRole(alpha.tenantId, "Reader", ["outlets.view"]);
    await assignBrandRole(actor.user.id, alpha.brandIds[0], roleId);

    await expect(
      updateBrandRole(getTestPool(), actor, ["outlets.view"], alpha.brandIds[0], roleId, { name: "Mine" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toMatchObject({ name: "Reader" });
  });
});

describe("grant limit through a brand role (integration)", () => {
  it("refuses new actions beyond the actor's brand-role actions", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const actor = await managerOn("lead@x.com", alpha.tenantId, alpha.brandIds[0]);

    await expect(
      createBrandRole(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], {
        name: "Lead",
        actions: ["outlets.view", "brandUsers.manage"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const names = (await listBrandRoles(getTestPool(), alpha.brandIds[0])).map((role) => role.name);
    expect(names).not.toContain("Lead");
  });

  it("refuses editing a role whose current actions exceed the limit, even to narrow it", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const actor = await managerOn("lead@x.com", alpha.tenantId, alpha.brandIds[0]);
    const roleId = await insertBrandRole(alpha.tenantId, "Analyst", ["outlets.view", "results.view"]);

    await expect(
      updateBrandRole(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], roleId, { actions: ["outlets.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      deleteBrandRole(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], roleId),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toMatchObject({ name: "Analyst", actions: ["outlets.view", "results.view"] });
  });

  it("creates, edits and deletes within the limit", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const actor = await managerOn("lead@x.com", alpha.tenantId, alpha.brandIds[0]);

    const role = await createBrandRole(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], {
      name: "Reader",
      actions: ["outlets.view"],
    });
    const edited = await updateBrandRole(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], role.id, {
      name: "Viewer",
      actions: ["outlets.view", "brandUsers.view"],
    });
    expect(edited).toMatchObject({ name: "Viewer", actions: ["outlets.view", "brandUsers.view"], assignmentCount: 0 });
    expect(await storedRole(role.id)).toMatchObject({ name: "Viewer", actions: ["brandUsers.view", "outlets.view"] });

    await deleteBrandRole(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], role.id);
    expect(await storedRole(role.id)).toBeNull();
  });
});

describe("grant limit through provider support (integration)", () => {
  it("grants every non-personal action, brandUsers.manage included", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const actor = await supportFor("support@x.com");

    const role = await createBrandRole(getTestPool(), actor, null, alpha.brandIds[0], {
      name: "Lead",
      actions: ["brandUsers.manage", "apiKeys.create", "brandRoles.manage"],
    });

    expect(await storedRole(role.id)).toMatchObject({
      actions: ["apiKeys.create", "brandRoles.manage", "brandUsers.manage"],
    });
  });

  it("refuses a personal-data action unless held through a brand role on that brand", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha", "Bravo");
    const actor = await supportFor("support@x.com");

    await expect(
      createBrandRole(getTestPool(), actor, null, alpha.brandIds[0], { name: "Analyst", actions: ["customerScores.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const role = await createBrandRole(getTestPool(), actor, ["customerScores.view"], alpha.brandIds[1], {
      name: "Analyst",
      actions: ["customerScores.view", "results.view"],
    });
    expect(await storedRole(role.id)).toMatchObject({ actions: ["customerScores.view", "results.view"] });
  });

  it("refuses Admin editing or deleting a role that holds personal data", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const admin = await adminFor("admin@x.com");
    const roleId = await insertBrandRole(alpha.tenantId, "Ids", ["snapshots.view", "snapshots.viewCustomerIds"]);

    await expect(
      updateBrandRole(getTestPool(), admin, null, alpha.brandIds[0], roleId, { actions: ["snapshots.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteBrandRole(getTestPool(), admin, null, alpha.brandIds[0], roleId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    expect(await storedRole(roleId)).toMatchObject({ actions: ["snapshots.view", "snapshots.viewCustomerIds"] });
  });
});

describe("built-in Brand Owner and roles in use (integration)", () => {
  it("refuses editing or deleting the built-in Brand Owner", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const admin = await adminFor("admin@x.com");
    const ownerId = await brandOwnerOf(alpha.tenantId);
    const before = await storedRole(ownerId);

    await expect(
      updateBrandRole(getTestPool(), admin, null, alpha.brandIds[0], ownerId, { name: "Boss" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteBrandRole(getTestPool(), admin, null, alpha.brandIds[0], ownerId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    expect(await storedRole(ownerId)).toEqual(before);
  });

  it("returns 409 when deleting a role someone holds", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const admin = await adminFor("admin@x.com");
    const roleId = await insertBrandRole(alpha.tenantId, "Reader", ["outlets.view"]);
    await assignBrandRole(await userNamed("bob@x.com"), alpha.brandIds[0], roleId);

    await expect(deleteBrandRole(getTestPool(), admin, null, alpha.brandIds[0], roleId)).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect(await storedRole(roleId)).toMatchObject({ name: "Reader" });
  });
});

describe("listBrandRoleAssignments (integration)", () => {
  it("lists holders across the tenant's live brands", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha", "Bravo", "Gone");
    const actor = await managerOn("lead@x.com", alpha.tenantId, alpha.brandIds[0]);
    const roleId = await insertBrandRole(alpha.tenantId, "Reader", ["outlets.view"]);
    const bob = await userNamed("bob@x.com");
    for (const brandId of alpha.brandIds) await assignBrandRole(bob, brandId, roleId);
    await getTestPool().query(`UPDATE brands SET deleted_at = now() WHERE id = $1`, [alpha.brandIds[2]]);

    const rows = await listBrandRoleAssignments(getTestPool(), actor, MANAGER_ACTIONS, alpha.brandIds[0], roleId);

    expect(rows.map((row) => [row.email, row.brandName, row.tenantName])).toEqual([
      ["bob@x.com", "Alpha", "Alpha Group"],
      ["bob@x.com", "Bravo", "Alpha Group"],
    ]);
  });

  it("refuses a merchant without brandUsers.view", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const actor = await merchantFor("lead@x.com");
    const roleId = await insertBrandRole(alpha.tenantId, "Reader", ["outlets.view"]);

    await expect(
      listBrandRoleAssignments(getTestPool(), actor, ["brandRoles.view"], alpha.brandIds[0], roleId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets provider view list holders", async () => {
    const alpha = await tenantWithBrands("Alpha Group", "Alpha");
    const actor = await actorWith("viewer@x.com", ["provider.view"]);
    const roleId = await insertBrandRole(alpha.tenantId, "Reader", ["outlets.view"]);
    await assignBrandRole(await userNamed("bob@x.com"), alpha.brandIds[0], roleId);

    const rows = await listBrandRoleAssignments(getTestPool(), actor, null, alpha.brandIds[0], roleId);

    expect(rows.map((row) => row.email)).toEqual(["bob@x.com"]);
  });
});
