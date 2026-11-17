import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import type { RequestAccess } from "./authorization.service.js";
import { createBrand } from "./brand.service.js";
import { deleteRole, listRoleAssignments, updateRole } from "./role.service.js";
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

async function insertRole(kind: "console" | "brand", name: string, actions: string[], isBuiltin = false) {
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

async function brandNamed(name: string): Promise<string> {
  const tenant = await createTenant(getTestPool(), { name: `${name} Group` });
  return (await createBrand(getTestPool(), { tenantId: tenant.id, name })).id;
}

async function assignBrandRole(userId: string, brandId: string, roleId: string) {
  await getTestPool().query(`INSERT INTO user_brand_roles (user_id, brand_id, role_id) VALUES ($1, $2, $3)`, [
    userId,
    brandId,
    roleId,
  ]);
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

  it("leaves brand roles to the actor's roles.manage", async () => {
    const actor = await roleManagerFor("lead@x.com");
    const roleId = await insertRole("brand", "Owner", ["outlets.view", "customerScores.view"]);

    await updateRole(getTestPool(), actor, roleId, { actions: [] });

    expect(await storedRole(roleId)).toEqual({ name: "Owner", actions: [] });
  });
});

describe("updateRole (integration)", () => {
  it("replaces the actions exactly and renames", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view", "results.view", "usage.view"]);

    const role = await updateRole(getTestPool(), actor, roleId, {
      name: "Reader",
      actions: ["results.view", "usage.view", "feedback.view"],
    });

    expect(role).toMatchObject({ name: "Reader", actions: ["results.view", "usage.view", "feedback.view"] });
    expect(await storedRole(roleId)).toEqual({
      name: "Reader",
      actions: ["feedback.view", "results.view", "usage.view"],
    });
  });

  it("clears the actions with an empty list", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);

    await updateRole(getTestPool(), actor, roleId, { actions: [] });

    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: [] });
  });

  it("leaves the actions alone on a rename only", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);

    const role = await updateRole(getTestPool(), actor, roleId, { name: "Reader" });

    expect(role).toMatchObject({ name: "Reader", actions: ["outlets.view"], assignmentCount: 0 });
    expect(await storedRole(roleId)).toEqual({ name: "Reader", actions: ["outlets.view"] });
  });

  it("leaves a built-in role untouched", async () => {
    const actor = await actorFor("admin@x.com");
    const adminRoleId = await insertRole("console", "Admin", [], true);

    await expect(
      updateRole(getTestPool(), actor, adminRoleId, { name: "Boss", actions: ["tenants.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(adminRoleId)).toEqual({ name: "Admin", actions: [] });
  });

  it("refuses a brand role the actor holds on any brand and writes nothing", async () => {
    const actor = await actorFor("lead@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);
    await assignBrandRole(actor.user.id, await brandNamed("Alpha"), roleId);

    await expect(
      updateRole(getTestPool(), actor, roleId, { name: "Viewer Plus", actions: ["outlets.view", "customerScores.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: ["outlets.view"] });
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
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);
    const other = await userNamed("bob@x.com");
    await assignBrandRole(other, await brandNamed("Alpha"), roleId);
    await assignBrandRole(other, await brandNamed("Beta"), roleId);

    const role = await updateRole(getTestPool(), actor, roleId, { name: "Reader" });

    expect(role.assignmentCount).toBe(2);
  });
});

describe("deleteRole (integration)", () => {
  it("deletes an unused role and its permissions", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);

    await deleteRole(getTestPool(), actor, roleId);

    expect(await storedRole(roleId)).toBeNull();
    const permissions = await getTestPool().query(`SELECT 1 FROM role_permissions WHERE role_id = $1`, [roleId]);
    expect(permissions.rows).toEqual([]);
  });

  it("refuses a role in use", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);
    await assignBrandRole(await userNamed("bob@x.com"), await brandNamed("Alpha"), roleId);

    await expect(deleteRole(getTestPool(), actor, roleId)).rejects.toBeInstanceOf(ConflictError);

    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: ["outlets.view"] });
  });

  it("refuses a built-in role", async () => {
    const actor = await actorFor("admin@x.com");
    const adminRoleId = await insertRole("console", "Admin", [], true);

    await expect(deleteRole(getTestPool(), actor, adminRoleId)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(adminRoleId)).toEqual({ name: "Admin", actions: [] });
  });

  it("refuses a role the actor holds", async () => {
    const actor = await actorFor("lead@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);
    await assignBrandRole(actor.user.id, await brandNamed("Alpha"), roleId);

    await expect(deleteRole(getTestPool(), actor, roleId)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedRole(roleId)).toEqual({ name: "Viewer", actions: ["outlets.view"] });
  });
});

describe("listRoleAssignments (integration)", () => {
  it("lists only the holders of a console role", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("console", "Support", ["users.view"]);
    const otherRoleId = await insertRole("console", "Other", ["users.view"]);
    await assignConsoleRole(await userNamed("bob@x.com"), roleId);
    await assignConsoleRole(await userNamed("cat@x.com"), otherRoleId);

    const rows = await listRoleAssignments(getTestPool(), actor, roleId);

    expect(rows).toEqual([
      expect.objectContaining({ email: "bob@x.com", status: "active", brandId: null, brandName: null, tenantName: null }),
    ]);
  });

  it("lists one row per brand and leaves out a soft-deleted brand", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);
    const userId = await userNamed("bob@x.com");
    const alphaId = await brandNamed("Alpha");
    const betaId = await brandNamed("Beta");
    const goneId = await brandNamed("Gone");
    for (const brandId of [alphaId, betaId, goneId]) await assignBrandRole(userId, brandId, roleId);
    await getTestPool().query(`UPDATE brands SET deleted_at = now() WHERE id = $1`, [goneId]);

    const rows = await listRoleAssignments(getTestPool(), actor, roleId);

    expect(rows.map((row) => [row.brandName, row.tenantName])).toEqual([
      ["Alpha", "Alpha Group"],
      ["Beta", "Beta Group"],
    ]);
    expect(rows[0]).toMatchObject({ userId, email: "bob@x.com", brandId: alphaId });
  });

  it("leaves out a brand whose tenant is soft-deleted", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);
    const userId = await userNamed("bob@x.com");
    await assignBrandRole(userId, await brandNamed("Alpha"), roleId);
    const orphanedId = await brandNamed("Beta");
    await assignBrandRole(userId, orphanedId, roleId);
    await getTestPool().query(
      `UPDATE tenants SET deleted_at = now() WHERE id = (SELECT tenant_id FROM brands WHERE id = $1)`,
      [orphanedId],
    );

    const rows = await listRoleAssignments(getTestPool(), actor, roleId);

    expect(rows.map((row) => row.brandName)).toEqual(["Alpha"]);
  });

  it("orders by email, then tenant, then brand", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);
    const zed = await userNamed("zed@x.com");
    const amy = await userNamed("amy@x.com");
    const brandIn = async (tenantName: string, name: string) => {
      const tenant = await createTenant(getTestPool(), { name: tenantName });
      return (await createBrand(getTestPool(), { tenantId: tenant.id, name })).id;
    };
    const zetaAlpha = await brandIn("Zeta Group", "Alpha");
    const betaZulu = await brandIn("Beta Group", "Zulu");
    await assignBrandRole(zed, zetaAlpha, roleId);
    await assignBrandRole(amy, zetaAlpha, roleId);
    await assignBrandRole(amy, betaZulu, roleId);

    const rows = await listRoleAssignments(getTestPool(), actor, roleId);

    expect(rows.map((row) => [row.email, row.tenantName, row.brandName])).toEqual([
      ["amy@x.com", "Beta Group", "Zulu"],
      ["amy@x.com", "Zeta Group", "Alpha"],
      ["zed@x.com", "Zeta Group", "Alpha"],
    ]);
  });

  it("returns an empty list for an unused role", async () => {
    const actor = await actorFor("admin@x.com");
    const roleId = await insertRole("brand", "Viewer", ["outlets.view"]);

    expect(await listRoleAssignments(getTestPool(), actor, roleId)).toEqual([]);
  });

  it("throws NotFound for an unknown role", async () => {
    const actor = await actorFor("admin@x.com");

    await expect(
      listRoleAssignments(getTestPool(), actor, "99999999-9999-9999-9999-999999999999"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
