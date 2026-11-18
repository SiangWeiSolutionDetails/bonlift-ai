import type { BrandAction, ConsoleAction } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import type { RequestAccess } from "./authorization.service.js";
import { addBrandUser, listUserBrandRoles, removeBrandUser, setBrandUser } from "./brandUser.service.js";

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

// A brand role belongs to the tenant of brandId.
async function insertRole(
  name: string,
  kind: "console" | "brand",
  actions: string[],
  brandId: string | null = null,
): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH role AS (
      INSERT INTO roles (name, kind, tenant_id)
      VALUES ($1, $2, (SELECT tenant_id FROM brands WHERE id = $4))
      RETURNING id
    ),
    perms AS (
      INSERT INTO role_permissions (role_id, action)
      SELECT role.id, a.action FROM role, unnest($3::text[]) AS a(action)
    )
    SELECT id FROM role
    `,
    [name, kind, actions, brandId],
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

async function insertSiblingBrand(brandId: string, name: string): Promise<string> {
  const result = await getTestPool().query(
    `INSERT INTO brands (tenant_id, name) SELECT tenant_id, $2 FROM brands WHERE id = $1 RETURNING id`,
    [brandId, name],
  );
  return result.rows[0].id;
}

async function assignBrandRole(userId: string, brandId: string, roleId: string): Promise<void> {
  await getTestPool().query(
    `
    INSERT INTO user_brand_roles (user_id, brand_id, tenant_id, role_id)
    SELECT $1, b.id, b.tenant_id, $3 FROM brands b WHERE b.id = $2`,
    [userId, brandId, roleId],
  );
}

async function brandLead(email: string, brandId: string, actions: BrandAction[]): Promise<Actor> {
  const id = await userNamed(email);
  await assignBrandRole(id, brandId, await insertRole(`${email} brand role`, "brand", actions, brandId));
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
  const result = await getTestPool().query(
    `SELECT id, status, display_name, display_name_source FROM users WHERE email = $1`,
    [email],
  );
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

const LEAD_ACTIONS: BrandAction[] = ["brandUsers.view", "brandUsers.manage", "customerScores.view"];

describe("addBrandUser (integration)", () => {
  it("creates an invited user plus the assignment for a new email", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);

    const brandUser = await addBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, {
      email: "New@X.com",
      displayName: "Newbie",
      roleId: viewer,
    });

    const stored = await userByEmail("new@x.com");
    expect(stored).toMatchObject({ status: "invited", display_name: "Newbie", display_name_source: "staff" });
    expect(brandUser).toEqual({
      userId: stored.id,
      email: "new@x.com",
      displayName: "Newbie",
      status: "invited",
      roleId: viewer,
      roleName: "Viewer",
    });
    expect(await storedBrandRole(stored.id, brandId)).toEqual({ role_id: viewer, granted_by: lead.access.user.id });
  });

  it("leaves the name source empty for a new email without a name", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);

    await addBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, {
      email: "new@x.com",
      roleId: viewer,
    });

    expect(await userByEmail("new@x.com")).toMatchObject({ display_name: null, display_name_source: null });
  });

  it("adds an existing active user without changing their account", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);
    const bob = await userNamed("bob@x.com");

    const brandUser = await addBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, {
      email: "bob@x.com",
      roleId: viewer,
    });

    expect(brandUser).toMatchObject({ userId: bob, status: "active" });
    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: viewer, granted_by: lead.access.user.id });
  });

  it("refuses a disabled user's email and leaves no rows", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);
    const gone = await userNamed("gone@x.com", "disabled");

    await expect(
      addBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, { email: "gone@x.com", roleId: viewer }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await storedBrandRole(gone, brandId)).toBeNull();
    expect(await userByEmail("gone@x.com")).toMatchObject({ status: "disabled" });
  });

  it("refuses a role broader than the lead's and creates no user", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const broader = await insertRole("Owner", "brand", [...LEAD_ACTIONS, "apiKeys.manage"], brandId);

    await expect(
      addBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, { email: "new@x.com", roleId: broader }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await userByEmail("new@x.com")).toBeNull();
    expect(await brandRoleCount(brandId)).toBe(1);
  });

  it("refuses replacing a user whose current role exceeds the lead's and writes nothing", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const owner = await insertRole("Owner", "brand", [...LEAD_ACTIONS, "apiKeys.manage"], brandId);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);
    const boss = await userNamed("boss@x.com");
    await assignBrandRole(boss, brandId, owner);

    await expect(
      addBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, { email: "boss@x.com", roleId: viewer }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedBrandRole(boss, brandId)).toEqual({ role_id: owner, granted_by: null });
  });
});

describe("setBrandUser and removeBrandUser (integration)", () => {
  it("through brandUsers.manage, refuses downgrading or removing a broader user and writes nothing", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const owner = await insertRole("Owner", "brand", [...LEAD_ACTIONS, "apiKeys.manage"], brandId);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);
    const boss = await userNamed("boss@x.com");
    await assignBrandRole(boss, brandId, owner);

    await expect(
      setBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, boss, viewer),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      removeBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, boss),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedBrandRole(boss, brandId)).toEqual({ role_id: owner, granted_by: null });
  });

  it("through users.assignBrandRoles, assigns any brand role", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const ops = await provisioner("ops@x.com");
    const owner = await insertRole("Owner", "brand", [...LEAD_ACTIONS, "apiKeys.manage"], brandId);
    const bob = await userNamed("bob@x.com");

    const brandUser = await setBrandUser(getTestPool(), ops.access, ops.brandActions, brandId, bob, owner);

    expect(brandUser).toMatchObject({ userId: bob, roleId: owner, roleName: "Owner" });
    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: owner, granted_by: ops.access.user.id });
  });

  it("through brandUsers.manage, replaces and removes a user within the lead's actions", async () => {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const lead = await brandLead("lead@x.com", brandId, LEAD_ACTIONS);
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);
    const helper = await insertRole("Helper", "brand", ["brandUsers.view", "customerScores.view"], brandId);
    const bob = await userNamed("bob@x.com");
    await assignBrandRole(bob, brandId, viewer);
    await assignBrandRole(bob, await insertSiblingBrand(brandId, "Brand B"), viewer);

    await setBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, bob, helper);
    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: helper, granted_by: lead.access.user.id });

    await removeBrandUser(getTestPool(), lead.access, lead.brandActions, brandId, bob);
    expect(await storedBrandRole(bob, brandId)).toBeNull();
  });
});

describe("removeBrandUser last role (integration)", () => {
  const LAST_ROLE = new ConflictError("A user must keep at least one role.");

  async function soleUser() {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const ops = await provisioner("ops@x.com");
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);
    const bob = await userNamed("bob@x.com");
    await assignBrandRole(bob, brandId, viewer);
    const remove = () => removeBrandUser(getTestPool(), ops.access, ops.brandActions, brandId, bob);
    return { brandId, viewer, bob, remove };
  }

  it("returns 409 for the only brand role of a user with no console role and changes nothing", async () => {
    const { brandId, viewer, bob, remove } = await soleUser();

    await expect(remove()).rejects.toThrow(LAST_ROLE);

    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: viewer, granted_by: null });
  });

  it("removes the only brand role of a user with a console role", async () => {
    const { brandId, bob, remove } = await soleUser();
    const consoleRole = await insertRole("Support", "console", ["users.view"]);
    await getTestPool().query(`INSERT INTO user_console_roles (user_id, role_id) VALUES ($1, $2)`, [bob, consoleRole]);

    await remove();

    expect(await storedBrandRole(bob, brandId)).toBeNull();
  });

  it("removes one of two brand roles", async () => {
    const { brandId, viewer, bob, remove } = await soleUser();
    const other = await insertSiblingBrand(brandId, "Brand B");
    await assignBrandRole(bob, other, viewer);

    await remove();

    expect(await storedBrandRole(bob, brandId)).toBeNull();
    expect(await storedBrandRole(bob, other)).toEqual({ role_id: viewer, granted_by: null });
  });

  it("does not count a brand role on a soft-deleted brand or a brand of a soft-deleted tenant", async () => {
    const { brandId, viewer, bob, remove } = await soleUser();
    const deletedBrand = await insertSiblingBrand(brandId, "Brand B");
    const tenantDeletedBrand = await insertBrand("Tenant C", "Brand C");
    await assignBrandRole(bob, deletedBrand, viewer);
    const otherTenantViewer = await insertRole("Viewer", "brand", ["customerScores.view"], tenantDeletedBrand);
    await assignBrandRole(bob, tenantDeletedBrand, otherTenantViewer);
    await getTestPool().query(`UPDATE brands SET deleted_at = now() WHERE id = $1`, [deletedBrand]);
    await getTestPool().query(
      `UPDATE tenants SET deleted_at = now() WHERE id = (SELECT tenant_id FROM brands WHERE id = $1)`,
      [tenantDeletedBrand],
    );

    await expect(remove()).rejects.toThrow(LAST_ROLE);

    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: viewer, granted_by: null });
  });
});

describe("cross-tenant brand roles (integration)", () => {
  const ROLE_MISSING = new NotFoundError("Role does not exist.");

  async function twoTenants() {
    const brandId = await insertBrand("Tenant A", "Brand A");
    const otherBrand = await insertBrand("Tenant B", "Brand B");
    const ops = await provisioner("ops@x.com");
    const foreignRole = await insertRole("Viewer", "brand", ["customerScores.view"], otherBrand);
    return { brandId, ops, foreignRole };
  }

  it("refuses adding a new email with another tenant's role and creates no user", async () => {
    const { brandId, ops, foreignRole } = await twoTenants();

    await expect(
      addBrandUser(getTestPool(), ops.access, ops.brandActions, brandId, { email: "new@x.com", roleId: foreignRole }),
    ).rejects.toThrow(ROLE_MISSING);

    expect(await userByEmail("new@x.com")).toBeNull();
    expect(await brandRoleCount(brandId)).toBe(0);
  });

  it("refuses adding an existing user with another tenant's role and writes nothing", async () => {
    const { brandId, ops, foreignRole } = await twoTenants();
    const bob = await userNamed("bob@x.com");

    await expect(
      addBrandUser(getTestPool(), ops.access, ops.brandActions, brandId, { email: "bob@x.com", roleId: foreignRole }),
    ).rejects.toThrow(ROLE_MISSING);

    expect(await storedBrandRole(bob, brandId)).toBeNull();
  });

  it("refuses adding with a console role and creates no user", async () => {
    const { brandId, ops } = await twoTenants();
    const consoleRole = await insertRole("Support", "console", ["users.view"]);

    await expect(
      addBrandUser(getTestPool(), ops.access, ops.brandActions, brandId, { email: "new@x.com", roleId: consoleRole }),
    ).rejects.toThrow(ROLE_MISSING);

    expect(await userByEmail("new@x.com")).toBeNull();
  });

  it("refuses setting another tenant's role and keeps the current one", async () => {
    const { brandId, ops, foreignRole } = await twoTenants();
    const viewer = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);
    const bob = await userNamed("bob@x.com");
    await assignBrandRole(bob, brandId, viewer);

    await expect(
      setBrandUser(getTestPool(), ops.access, ops.brandActions, brandId, bob, foreignRole),
    ).rejects.toThrow(ROLE_MISSING);

    expect(await storedBrandRole(bob, brandId)).toEqual({ role_id: viewer, granted_by: null });
  });

  it("refuses setting another tenant's role on a user with no role on the brand and writes nothing", async () => {
    const { brandId, ops, foreignRole } = await twoTenants();
    const bob = await userNamed("bob@x.com");

    await expect(
      setBrandUser(getTestPool(), ops.access, ops.brandActions, brandId, bob, foreignRole),
    ).rejects.toThrow(ROLE_MISSING);

    expect(await storedBrandRole(bob, brandId)).toBeNull();
  });

  it("still assigns a role of the brand's own tenant", async () => {
    const { brandId, ops } = await twoTenants();
    const ownRole = await insertRole("Viewer", "brand", ["customerScores.view"], brandId);

    const brandUser = await addBrandUser(getTestPool(), ops.access, ops.brandActions, brandId, {
      email: "new@x.com",
      roleId: ownRole,
    });

    expect(await storedBrandRole(brandUser.userId, brandId)).toEqual({ role_id: ownRole, granted_by: ops.access.user.id });
  });
});

describe("listUserBrandRoles (integration)", () => {
  it("lists roles on live brands of live tenants, ordered by tenant then brand", async () => {
    const zeta = await insertBrand("Zeta", "Alpha brand");
    const acmeB = await insertBrand("Acme", "B brand");
    const gone = await insertBrand("Acme 2", "Deleted brand");
    await getTestPool().query(`UPDATE brands SET deleted_at = now() WHERE id = $1`, [gone]);
    const bob = await userNamed("bob@x.com");
    for (const brandId of [zeta, acmeB, gone]) {
      await assignBrandRole(bob, brandId, await insertRole("Viewer", "brand", ["customerScores.view"], brandId));
    }

    const roles = await listUserBrandRoles(getTestPool(), bob);

    expect(roles.map((r) => [r.tenantName, r.brandName, r.roleName])).toEqual([
      ["Acme", "B brand", "Viewer"],
      ["Zeta", "Alpha brand", "Viewer"],
    ]);
  });
});
