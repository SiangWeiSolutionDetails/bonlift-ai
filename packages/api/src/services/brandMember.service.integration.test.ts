import type { BrandAction, ConsoleAction } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import type { RequestAccess } from "./authorization.service.js";
import { addBrandMember, listUserBrandRoles, removeBrandMember, setBrandMember } from "./brandMember.service.js";

interface Actor {
  access: RequestAccess;
  brandActions: BrandAction[] | null;
}

async function userNamed(email: string, status = "active"): Promise<string> {
  const result = await getTestPool().query(`INSERT INTO users (email, status) VALUES ($1, $2) RETURNING id`, [
    email,
    status,
  ]);
  return result.rows[0].id;
}

async function insertRole(name: string, kind: "console" | "brand", actions: string[]): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH role AS (
      INSERT INTO roles (name, kind) VALUES ($1, $2) RETURNING id
    ),
    perms AS (
      INSERT INTO role_permissions (role_id, action)
      SELECT role.id, a.action FROM role, unnest($3::text[]) AS a(action)
    )
    SELECT id FROM role
    `,
    [name, kind, actions],
  );
  return result.rows[0].id;
}

async function insertBrand(tenantName: string, brandName: string): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH tenant AS (
      INSERT INTO tenants (name) VALUES ($1) RETURNING id
    )
    INSERT INTO brands (tenant_id, name) SELECT id, $2 FROM tenant RETURNING id
    `,
    [tenantName, brandName],
  );
  return result.rows[0].id;
}

async function assignBrandRole(userId: string, brandId: string, roleId: string): Promise<void> {
  await getTestPool().query(`INSERT INTO user_brand_roles (user_id, brand_id, role_id) VALUES ($1, $2, $3)`, [
    userId,
    brandId,
    roleId,
  ]);
}

async function brandLead(email: string, brandId: string, actions: BrandAction[]): Promise<Actor> {
  const id = await userNamed(email);
  await assignBrandRole(id, brandId, await insertRole(`${email} brand role`, "brand", actions));
  return { access: { user: { id, email, displayName: null }, isAdmin: false, consoleActions: [] }, brandActions: actions };
}

async function provisioner(email: string): Promise<Actor> {
  const consoleActions: ConsoleAction[] = ["users.view", "users.assignBrandRoles"];
  const id = await userNamed(email);
  const roleId = await insertRole(`${email} console role`, "console", consoleActions);
  await getTestPool().query(`INSERT INTO user_console_roles (user_id, role_id) VALUES ($1, $2)`, [id, roleId]);
  return { access: { user: { id, email, displayName: null }, isAdmin: false, consoleActions }, brandActions: null };
}

async function userByEmail(email: string) {
  const result = await getTestPool().query(`SELECT id, status, display_name FROM users WHERE email = $1`, [email]);
  return result.rows[0] ?? null;
}

async function storedBrandRole(userId: string, brandId: string) {
  const result = await getTestPool().query(
    `SELECT role_id, granted_by FROM user_brand_roles WHERE user_id = $1 AND brand_id = $2`,
    [userId, brandId],
  );
  return result.rows[0] ?? null;
}

async function brandRoleCount(brandId: string): Promise<number> {
  const result = await getTestPool().query(`SELECT count(*)::int AS n FROM user_brand_roles WHERE brand_id = $1`, [
    brandId,
  ]);
  return result.rows[0].n;
}

const LEAD_ACTIONS: BrandAction[] = ["members.view", "members.manage", "customerScores.view"];

describe("addBrandMember (integration)", () => {
  it("creates an invited user plus the assignment for a new email", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"]);

    const member = await addBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, {
      email: "New@X.com",
      displayName: "Newbie",
      roleId: viewer,
    });

    const stored = await userByEmail("new@x.com");
    expect(stored).toMatchObject({ status: "invited", display_name: "Newbie" });
    expect(member).toEqual({
      userId: stored.id,
      email: "new@x.com",
      displayName: "Newbie",
      status: "invited",
      roleId: viewer,
      roleName: "Viewer",
    });
    expect(await storedBrandRole(stored.id, brandId)).toEqual({ role_id: viewer, granted_by: lead.access.user.id });
  });

  it("adds an existing active user without changing their account", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"]);
    const bob = await userNamed("bob@x.com");

    const member = await addBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, {
      email: "bob@x.com",
      roleId: viewer,
    });

    expect(member).toMatchObject({ userId: bob, status: "active" });
    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: viewer, granted_by: lead.access.user.id });
  });

  it("refuses a disabled user's email and leaves no rows", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"]);
    const gone = await userNamed("gone@x.com", "disabled");

    await expect(
      addBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, { email: "gone@x.com", roleId: viewer }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await storedBrandRole(gone, brandId)).toBeNull();
    expect(await userByEmail("gone@x.com")).toMatchObject({ status: "disabled" });
  });

  it("refuses a role broader than the lead's and creates no user", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const broader = await insertRole("Owner", "brand", [...LEAD_ACTIONS, "apiKeys.manage"]);

    await expect(
      addBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, { email: "new@x.com", roleId: broader }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await userByEmail("new@x.com")).toBeNull();
    expect(await brandRoleCount(brandId)).toBe(1);
  });

  it("refuses replacing a member whose current role exceeds the lead's and writes nothing", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const owner = await insertRole("Owner", "brand", [...LEAD_ACTIONS, "apiKeys.manage"]);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"]);
    const boss = await userNamed("boss@x.com");
    await assignBrandRole(boss, brandId, owner);

    await expect(
      addBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, { email: "boss@x.com", roleId: viewer }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedBrandRole(boss, brandId)).toEqual({ role_id: owner, granted_by: null });
  });
});

describe("setBrandMember and removeBrandMember (integration)", () => {
  it("through members.manage, refuses downgrading or removing a broader member and writes nothing", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const owner = await insertRole("Owner", "brand", [...LEAD_ACTIONS, "apiKeys.manage"]);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"]);
    const boss = await userNamed("boss@x.com");
    await assignBrandRole(boss, brandId, owner);

    await expect(
      setBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, boss, viewer),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      removeBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, boss),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedBrandRole(boss, brandId)).toEqual({ role_id: owner, granted_by: null });
  });

  it("through users.assignBrandRoles, assigns any brand role", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const ops = await provisioner("ops@x.com");
    const owner = await insertRole("Owner", "brand", [...LEAD_ACTIONS, "apiKeys.manage"]);
    const bob = await userNamed("bob@x.com");

    const member = await setBrandMember(getTestPool(), ops.access, ops.brandActions, brandId, bob, owner);

    expect(member).toMatchObject({ userId: bob, roleId: owner, roleName: "Owner" });
    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: owner, granted_by: ops.access.user.id });
  });

  it("through members.manage, replaces and removes a member within the lead's actions", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"]);
    const helper = await insertRole("Helper", "brand", ["members.view", "customerScores.view"]);
    const bob = await userNamed("bob@x.com");
    await assignBrandRole(bob, brandId, viewer);

    await setBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, bob, helper);
    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: helper, granted_by: lead.access.user.id });

    await removeBrandMember(getTestPool(), lead.access, lead.brandActions, brandId, bob);
    expect(await storedBrandRole(bob, brandId)).toBeNull();
  });
});

describe("listUserBrandRoles (integration)", () => {
  it("lists roles on live brands of live tenants, ordered by tenant then brand", async () => {
    const zeta = await insertBrand("Zeta", "Alpha brand");
    const acmeB = await insertBrand("Acme", "B brand");
    const gone = await insertBrand("Acme 2", "Deleted brand");
    await getTestPool().query(`UPDATE brands SET deleted_at = now() WHERE id = $1`, [gone]);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"]);
    const bob = await userNamed("bob@x.com");
    for (const brandId of [zeta, acmeB, gone]) await assignBrandRole(bob, brandId, viewer);

    const roles = await listUserBrandRoles(getTestPool(), bob);

    expect(roles.map((r) => [r.tenantName, r.brandName, r.roleName])).toEqual([
      ["Acme", "B brand", "Viewer"],
      ["Zeta", "Alpha brand", "Viewer"],
    ]);
  });
});
