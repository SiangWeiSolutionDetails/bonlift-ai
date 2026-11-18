import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import type { RequestAccess } from "./authorization.service.js";
import { createBrand } from "./brand.service.js";
import { createRole, deleteRole, listRoleAssignments, listRoles, updateRole } from "./role.service.js";
import { createTenant } from "./tenant.service.js";

async function userNamed(email: string): Promise<string> {
  const result = await getTestPool().query(`INSERT INTO users (email, status) VALUES ($1, 'active') RETURNING id`, [
    email,
  ]);
  return result.rows[0].id;
}

async function actorFor(email: string): Promise<RequestAccess> {
  const id = await userNamed(email);
  return { user: { id, email, displayName: null }, isAdmin: true, consoleActions: [...CONSOLE_ACTIONS] };
}

async function insertRole(
  kind: "console" | "brand",
  name: string,
  actions: string[],
  isBuiltin = false,
  tenantId: string | null = null,
) {
  const result = await getTestPool().query(
    `
    WITH role AS (
      INSERT INTO roles (name, kind, is_builtin, tenant_id) VALUES ($1, $2, $3, $5) RETURNING id
    ),
    perms AS (
      INSERT INTO role_permissions (role_id, action)
      SELECT role.id, a.action FROM role, unnest($4::text[]) AS a(action)
    )
    SELECT id FROM role
    `,
    [name, kind, isBuiltin, actions, tenantId],
  );
  return result.rows[0].id as string;
}

const insertBrandRole = (tenantId: string, name: string, actions: string[]) =>
  insertRole("brand", name, actions, false, tenantId);

async function storedRole(roleId: string) {
  const result = await getTestPool().query(
    `
    SELECT r.name, ARRAY(SELECT rp.action FROM role_permissions rp WHERE rp.role_id = r.id ORDER BY rp.action) AS actions
    FROM roles r
    WHERE r.id = $1`,
    [roleId],
  );
  return result.rows[0] ?? null;
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

async function assignConsoleRole(userId: string, roleId: string) {
  await getTestPool().query(`INSERT INTO user_console_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);
}

const ROLE_MANAGER_ACTIONS: RequestAccess["consoleActions"] = ["roles.view", "roles.manage"];

async function roleManagerFor(email: string): Promise<RequestAccess> {
  const id = await userNamed(email);
  await assignConsoleRole(id, await insertRole("console", `${email} role`, ROLE_MANAGER_ACTIONS));
  return { user: { id, email, displayName: null }, isAdmin: false, consoleActions: ROLE_MANAGER_ACTIONS };
}

const BROADER_ACTIONS = ["roles.manage", "roles.view", "users.assignConsoleRoles"];

describe("console roles broader than a non-Admin actor (integration)", () => {
  it("refuses narrowing, clearing or renaming one and writes nothing", async () => {
    const actor = await roleManagerFor("lead@x.com");
    const roleId = await insertRole("console", "Grantor", BROADER_ACTIONS);

    await expect(updateRole(getTestPool(), actor, roleId, { actions: ["roles.view"] })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(updateRole(getTestPool(), actor, roleId, { actions: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateRole(getTestPool(), actor, roleId, { name: "Lesser" })).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toEqual({ name: "Grantor", actions: BROADER_ACTIONS });
  });

  it("refuses deleting one and keeps it", async () => {
    const actor = await roleManagerFor("lead@x.com");
    const roleId = await insertRole("console", "Grantor", BROADER_ACTIONS);

    await expect(deleteRole(getTestPool(), actor, roleId)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toEqual({ name: "Grantor", actions: BROADER_ACTIONS });
  });

  it("still lets the actor edit and delete console roles within their actions", async () => {
    const actor = await roleManagerFor("lead@x.com");
    const roleId = await insertRole("console", "Reader", ["roles.view"]);

    await updateRole(getTestPool(), actor, roleId, { name: "Viewer", actions: [] });
    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: [] });

    await deleteRole(getTestPool(), actor, roleId);
    expect(await storedRole(roleId)).toBeNull();
  });
});

describe("console /roles refusing brand roles (integration)", () => {
  it("lists console roles only", async () => {
    await insertRole("console", "Support", ["users.view"]);
    await insertBrandRole(await tenantNamed("Alpha Group"), "Viewer", ["outlets.view"]);

    const roles = await listRoles(getTestPool());

    expect(roles.map((role) => role.kind)).not.toContain("brand");
    expect(roles.map((role) => role.name)).toContain("Support");
  });

  it("treats a brand role id as missing on edit, delete and assignments, and writes nothing", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertBrandRole(await tenantNamed("Alpha Group"), "Viewer", ["outlets.view"]);

    await expect(updateRole(getTestPool(), actor, roleId, { name: "Hijacked" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateRole(getTestPool(), actor, roleId, { actions: [] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteRole(getTestPool(), actor, roleId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listRoleAssignments(getTestPool(), actor, roleId)).rejects.toBeInstanceOf(NotFoundError);

    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: ["outlets.view"] });
  });

  it("refuses brand actions in a create or edit body", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Support", ["users.view"]);

    await expect(
      createRole(getTestPool(), actor, { name: "Brandish", actions: ["outlets.view"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(updateRole(getTestPool(), actor, roleId, { actions: ["outlets.view"] })).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(await storedRole(roleId)).toEqual({ name: "Support", actions: ["users.view"] });
  });

  it("creates a console role", async () => {
    const actor = await actorFor("admin@x.com");

    const role = await createRole(getTestPool(), actor, { name: "Support", actions: ["users.view"] });

    expect(role).toMatchObject({ kind: "console", actions: ["users.view"] });
    expect(await storedRole(role.id)).toEqual({ name: "Support", actions: ["users.view"] });
  });
});

describe("updateRole (integration)", () => {
  it("replaces the actions exactly and renames", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Viewer", ["tenants.view", "brands.view", "users.view"]);

    const role = await updateRole(getTestPool(), actor, roleId, {
      name: "Reader",
      actions: ["brands.view", "users.view", "roles.view"],
    });

    expect(role).toMatchObject({ name: "Reader", actions: ["brands.view", "users.view", "roles.view"] });
    expect(await storedRole(roleId)).toEqual({
      name: "Reader",
      actions: ["brands.view", "roles.view", "users.view"],
    });
  });

  it("clears the actions with an empty list", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Viewer", ["tenants.view"]);

    await updateRole(getTestPool(), actor, roleId, { actions: [] });

    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: [] });
  });

  it("leaves the actions alone on a rename only", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Viewer", ["tenants.view"]);

    const role = await updateRole(getTestPool(), actor, roleId, { name: "Reader" });

    expect(role).toMatchObject({ name: "Reader", actions: ["tenants.view"], assignmentCount: 0 });
    expect(await storedRole(roleId)).toEqual({ name: "Reader", actions: ["tenants.view"] });
  });

  it("leaves a built-in role untouched", async () => {
    const actor = await actorFor("admin@x.com");
    const adminRoleId = await insertRole("console", "Admin", [], true);

    await expect(
      updateRole(getTestPool(), actor, adminRoleId, { name: "Boss", actions: ["tenants.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(adminRoleId)).toEqual({ name: "Admin", actions: [] });
  });

  it("refuses the actor's own console role and writes nothing", async () => {
    const actor = await actorFor("lead@x.com");
    const roleId = await insertRole("console", "Role Manager", ["roles.manage"]);
    await assignConsoleRole(actor.user.id, roleId);

    await expect(
      updateRole(getTestPool(), actor, roleId, { actions: ["roles.manage", "users.assignConsoleRoles"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toEqual({ name: "Role Manager", actions: ["roles.manage"] });
  });

  it("counts the role's assignments", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Viewer", ["tenants.view"]);
    await assignConsoleRole(await userNamed("bob@x.com"), roleId);
    await assignConsoleRole(await userNamed("cat@x.com"), roleId);

    const role = await updateRole(getTestPool(), actor, roleId, { name: "Reader" });

    expect(role.assignmentCount).toBe(2);
  });
});

describe("deleteRole (integration)", () => {
  it("deletes an unused role and its permissions", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Viewer", ["tenants.view"]);

    await deleteRole(getTestPool(), actor, roleId);

    expect(await storedRole(roleId)).toBeNull();
    const permissions = await getTestPool().query(`SELECT 1 FROM role_permissions WHERE role_id = $1`, [roleId]);
    expect(permissions.rows).toEqual([]);
  });

  it("refuses a role in use", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Viewer", ["tenants.view"]);
    await assignConsoleRole(await userNamed("bob@x.com"), roleId);

    await expect(deleteRole(getTestPool(), actor, roleId)).rejects.toBeInstanceOf(ConflictError);

    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: ["tenants.view"] });
  });

  it("refuses a built-in role", async () => {
    const actor = await actorFor("admin@x.com");
    const adminRoleId = await insertRole("console", "Admin", [], true);

    await expect(deleteRole(getTestPool(), actor, adminRoleId)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(adminRoleId)).toEqual({ name: "Admin", actions: [] });
  });

  it("refuses a role the actor holds", async () => {
    const actor = await actorFor("lead@x.com");
    const roleId = await insertRole("console", "Viewer", ["tenants.view"]);
    await assignConsoleRole(actor.user.id, roleId);

    await expect(deleteRole(getTestPool(), actor, roleId)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: ["tenants.view"] });
  });
});

describe("listRoleAssignments (integration)", () => {
  it("lists only the holders of a console role, ordered by email", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Support", ["users.view"]);
    const otherRoleId = await insertRole("console", "Other", ["users.view"]);
    await assignConsoleRole(await userNamed("zed@x.com"), roleId);
    await assignConsoleRole(await userNamed("bob@x.com"), roleId);
    await assignConsoleRole(await userNamed("cat@x.com"), otherRoleId);

    const rows = await listRoleAssignments(getTestPool(), actor, roleId);

    expect(rows).toEqual([
      expect.objectContaining({ email: "bob@x.com", status: "active", brandId: null, brandName: null, tenantName: null }),
      expect.objectContaining({ email: "zed@x.com" }),
    ]);
  });

  it("returns an empty list for an unused role", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Support", ["users.view"]);

    expect(await listRoleAssignments(getTestPool(), actor, roleId)).toEqual([]);
  });

  it("throws NotFound for an unknown role", async () => {
    const actor = await actorFor("admin@x.com");

    await expect(
      listRoleAssignments(getTestPool(), actor, "99999999-9999-9999-9999-999999999999"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never lists brand holders", async () => {
    const actor = await actorFor("admin@x.com");
    const tenantId = await tenantNamed("Alpha Group");
    const brandRoleId = await insertBrandRole(tenantId, "Viewer", ["outlets.view"]);
    const brandId = (await createBrand(getTestPool(), { tenantId, name: "Alpha" })).id;
    await assignBrandRole(await userNamed("bob@x.com"), brandId, brandRoleId);

    await expect(listRoleAssignments(getTestPool(), actor, brandRoleId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
