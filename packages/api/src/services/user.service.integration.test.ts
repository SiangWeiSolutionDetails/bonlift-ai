import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import type { RequestAccess } from "./authorization.service.js";
import { removeBrandMember } from "./brandMember.service.js";
import type { Queryable } from "./session.service.js";
import {
  clearConsoleRole,
  deleteUser,
  disableUser,
  inviteUser,
  resolveUserFromIdentity,
  setConsoleRole,
  updateUser,
  type VerifiedIdentity,
} from "./user.service.js";

async function userNamed(email: string, status = "active"): Promise<string> {
  const result = await getTestPool().query(`INSERT INTO users (email, status) VALUES ($1, $2) RETURNING id`, [
    email,
    status,
  ]);
  return result.rows[0].id;
}

async function insertRole(name: string, actions: string[]): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH role AS (
      INSERT INTO roles (name, kind) VALUES ($1, 'console') RETURNING id
    ),
    perms AS (
      INSERT INTO role_permissions (role_id, action)
      SELECT role.id, a.action FROM role, unnest($2::text[]) AS a(action)
    )
    SELECT id FROM role
    `,
    [name, actions],
  );
  return result.rows[0].id;
}

async function adminRoleId(): Promise<string> {
  const result = await getTestPool().query(`SELECT id FROM roles WHERE kind = 'console' AND is_builtin`);
  if (result.rows[0]) return result.rows[0].id;
  const inserted = await getTestPool().query(
    `INSERT INTO roles (name, kind, is_builtin) VALUES ('Admin', 'console', true) RETURNING id`,
  );
  return inserted.rows[0].id;
}

async function assignConsoleRole(userId: string, roleId: string): Promise<void> {
  await getTestPool().query(`INSERT INTO user_console_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);
}

async function adminActor(email: string): Promise<RequestAccess> {
  const id = await userNamed(email);
  await assignConsoleRole(id, await adminRoleId());
  return { user: { id, email, displayName: null }, isAdmin: true, consoleActions: [...CONSOLE_ACTIONS] };
}

async function actorWithRole(email: string, consoleActions: RequestAccess["consoleActions"]): Promise<RequestAccess> {
  const id = await userNamed(email);
  await assignConsoleRole(id, await insertRole(`${email} role`, consoleActions));
  return { user: { id, email, displayName: null }, isAdmin: false, consoleActions };
}

async function storedConsoleRole(userId: string) {
  const result = await getTestPool().query(
    `SELECT role_id, granted_by FROM user_console_roles WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function insertSession(userId: string): Promise<void> {
  await getTestPool().query(
    `INSERT INTO user_sessions (id_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
    [randomBytes(32), userId],
  );
}

async function sessionCount(userId: string): Promise<number> {
  const result = await getTestPool().query(`SELECT count(*)::int AS n FROM user_sessions WHERE user_id = $1`, [userId]);
  return result.rows[0].n;
}

async function statusOf(userId: string): Promise<string> {
  const result = await getTestPool().query(`SELECT status FROM users WHERE id = $1`, [userId]);
  return result.rows[0].status;
}

const ASSIGNER_ACTIONS: RequestAccess["consoleActions"] = ["users.view", "users.assignConsoleRoles"];

async function waitForLockWaiter(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await getTestPool().query(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`,
    );
    if (result.rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("No statement waited on the row lock.");
}

// Another transaction changes the user's console role and holds the row lock while `write` starts from the old snapshot.
async function racingRoleChange<T>(userId: string, roleId: string, write: () => Promise<T>): Promise<T> {
  const client = await getTestPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE user_console_roles SET role_id = $2 WHERE user_id = $1`, [userId, roleId]);
    const pending = write();
    pending.catch(() => undefined);
    await waitForLockWaiter();
    await client.query("COMMIT");
    return await pending;
  } finally {
    client.release();
  }
}

describe("setConsoleRole (integration)", () => {
  it("assigns a role within the actor's actions and records who granted it", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");
    const roleId = await insertRole("Viewer", ["users.view"]);

    const user = await setConsoleRole(getTestPool(), actor, target, roleId);

    expect(user.consoleRole).toEqual({ id: roleId, name: "Viewer", isBuiltin: false });
    expect(await storedConsoleRole(target)).toEqual({ role_id: roleId, granted_by: actor.user.id });
  });

  it("replaces an existing role and sets granted_by to the new actor", async () => {
    const first = await adminActor("first@x.com");
    const actor = await adminActor("second@x.com");
    const target = await userNamed("bob@x.com");
    const oldRole = await insertRole("Viewer", ["users.view"]);
    const newRole = await insertRole("Support", ["users.view", "users.invite"]);
    await setConsoleRole(getTestPool(), first, target, oldRole);

    await setConsoleRole(getTestPool(), actor, target, newRole);

    expect(await storedConsoleRole(target)).toEqual({ role_id: newRole, granted_by: actor.user.id });
  });

  it("refuses a role with actions the actor lacks and writes nothing", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");
    const oldRole = await insertRole("Viewer", ["users.view"]);
    await assignConsoleRole(target, oldRole);
    const broader = await insertRole("Grantor", ["users.view", "roles.manage"]);

    await expect(setConsoleRole(getTestPool(), actor, target, broader)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedConsoleRole(target)).toEqual({ role_id: oldRole, granted_by: null });
  });

  it("refuses replacing a current role broader than the actor and writes nothing", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");
    const broader = await insertRole("Grantor", ["users.view", "roles.manage"]);
    await assignConsoleRole(target, broader);
    const narrower = await insertRole("Viewer", ["users.view"]);

    await expect(setConsoleRole(getTestPool(), actor, target, narrower)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedConsoleRole(target)).toEqual({ role_id: broader, granted_by: null });
  });

  it("refuses a non-Admin assigning the Admin role and writes nothing", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");

    await expect(setConsoleRole(getTestPool(), actor, target, await adminRoleId())).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    expect(await storedConsoleRole(target)).toBeNull();
  });

  it("refuses a non-Admin replacing an Admin's role and writes nothing", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("boss@x.com");
    const adminId = await adminRoleId();
    await assignConsoleRole(target, adminId);
    const viewer = await insertRole("Viewer", ["users.view"]);

    await expect(setConsoleRole(getTestPool(), actor, target, viewer)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedConsoleRole(target)).toEqual({ role_id: adminId, granted_by: null });
  });
});

describe("setConsoleRole races (integration)", () => {
  it("lets an Admin replace an Admin's role", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("boss@x.com");
    await assignConsoleRole(target, await adminRoleId());
    const viewer = await insertRole("Viewer", ["users.view"]);

    await setConsoleRole(getTestPool(), actor, target, viewer);

    expect(await storedConsoleRole(target)).toEqual({ role_id: viewer, granted_by: actor.user.id });
  });

  it("returns 409 and keeps the Admin role granted after the non-Admin's snapshot", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");
    const viewer = await insertRole("Viewer", ["users.view"]);
    await assignConsoleRole(target, viewer);
    const adminId = await adminRoleId();

    await expect(
      racingRoleChange(target, adminId, () => setConsoleRole(getTestPool(), actor, target, viewer)),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await storedConsoleRole(target)).toEqual({ role_id: adminId, granted_by: null });
  });
});

describe("clearConsoleRole (integration)", () => {
  it("lets a non-Admin clear a role within their actions", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");
    await assignConsoleRole(target, await insertRole("Viewer", ["users.view"]));
    await insertBrandRole(target);

    await clearConsoleRole(getTestPool(), actor, target);

    expect(await storedConsoleRole(target)).toBeNull();
  });

  it("succeeds for a user with no console role", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");

    await clearConsoleRole(getTestPool(), actor, target);

    expect(await storedConsoleRole(target)).toBeNull();
  });

  it("refuses a non-Admin clearing an Admin's role and writes nothing", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("boss@x.com");
    const adminId = await adminRoleId();
    await assignConsoleRole(target, adminId);

    await expect(clearConsoleRole(getTestPool(), actor, target)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedConsoleRole(target)).toEqual({ role_id: adminId, granted_by: null });
  });

  it("refuses a non-Admin clearing a role broader than their own and writes nothing", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");
    const broader = await insertRole("Grantor", ["users.view", "roles.manage"]);
    await assignConsoleRole(target, broader);

    await expect(clearConsoleRole(getTestPool(), actor, target)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await storedConsoleRole(target)).toEqual({ role_id: broader, granted_by: null });
  });

  it("returns 409 and keeps the Admin role granted after the non-Admin's snapshot", async () => {
    const actor = await actorWithRole("assigner@x.com", ASSIGNER_ACTIONS);
    const target = await userNamed("bob@x.com");
    await assignConsoleRole(target, await insertRole("Viewer", ["users.view"]));
    await insertBrandRole(target);
    const adminId = await adminRoleId();

    await expect(
      racingRoleChange(target, adminId, () => clearConsoleRole(getTestPool(), actor, target)),
    ).rejects.toThrow(new ConflictError("The user's role changed; try again."));

    expect(await storedConsoleRole(target)).toEqual({ role_id: adminId, granted_by: null });
  });

  it("returns 409 for the user's last role and changes nothing", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com");
    const viewer = await insertRole("Viewer", ["users.view"]);
    await assignConsoleRole(target, viewer);

    await expect(clearConsoleRole(getTestPool(), actor, target)).rejects.toThrow(
      new ConflictError("A user must keep at least one role."),
    );

    expect(await storedConsoleRole(target)).toEqual({ role_id: viewer, granted_by: null });
  });

  it("does not count a brand role on a soft-deleted brand or a brand of a soft-deleted tenant", async () => {
    const actor = await adminActor("admin@x.com");
    const viewer = await insertRole("Viewer", ["users.view"]);

    for (const [index, softDelete] of [softDeleteBrand, softDeleteTenantOf].entries()) {
      const target = await userNamed(`bob${index}@x.com`);
      await assignConsoleRole(target, viewer);
      await softDelete(await insertBrandRole(target));

      await expect(clearConsoleRole(getTestPool(), actor, target)).rejects.toThrow(
        new ConflictError("A user must keep at least one role."),
      );
      expect(await storedConsoleRole(target)).toEqual({ role_id: viewer, granted_by: null });
    }
  });
});

async function softDeleteBrand(brandId: string): Promise<void> {
  await getTestPool().query(`UPDATE brands SET deleted_at = now() WHERE id = $1`, [brandId]);
}

async function softDeleteTenantOf(brandId: string): Promise<void> {
  await getTestPool().query(
    `UPDATE tenants SET deleted_at = now() WHERE id = (SELECT tenant_id FROM brands WHERE id = $1)`,
    [brandId],
  );
}

// `first` runs in a transaction that holds its locks while `second` starts from the old snapshot.
async function racingRemovals(first: (db: PoolClient) => Promise<void>, second: () => Promise<void>) {
  const client = await getTestPool().connect();
  try {
    await client.query("BEGIN");
    await first(client);
    const pending = second();
    pending.catch(() => undefined);
    await waitForLockWaiter();
    await client.query("COMMIT");
    return await pending.then(
      () => null,
      (error: unknown) => error,
    );
  } finally {
    client.release();
  }
}

describe("last-role races (integration)", () => {
  async function userWithTwoRoles() {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com");
    await assignConsoleRole(target, await insertRole("Viewer", ["users.view"]));
    const brandId = await insertBrandRole(target);
    const clear = (db: Queryable = getTestPool()) => clearConsoleRole(db, actor, target);
    const remove = (db: Queryable = getTestPool()) => removeBrandMember(db, actor, null, brandId, target);
    return { target, clear, remove };
  }

  it("refuses removing the brand role while a console role clear commits first", async () => {
    const { target, clear, remove } = await userWithTwoRoles();

    const secondError = await racingRemovals((db) => clear(db), () => remove());

    expect(secondError).toEqual(new ConflictError("A user must keep at least one role."));
    expect(await rowCounts(target)).toMatchObject({ console_roles: 0, brand_roles: 1 });
  });

  it("refuses clearing the console role while a brand role removal commits first", async () => {
    const { target, clear, remove } = await userWithTwoRoles();

    const secondError = await racingRemovals((db) => remove(db), () => clear());

    expect(secondError).toEqual(new ConflictError("A user must keep at least one role."));
    expect(await rowCounts(target)).toMatchObject({ console_roles: 1, brand_roles: 0 });
  });
});

describe("disableUser (integration)", () => {
  it("disables the user and deletes only their sessions", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com");
    const bystander = await userNamed("carol@x.com");
    await insertSession(target);
    await insertSession(target);
    await insertSession(bystander);

    const user = await disableUser(getTestPool(), actor, target);

    expect(user.status).toBe("disabled");
    expect(await statusOf(target)).toBe("disabled");
    expect(await sessionCount(target)).toBe(0);
    expect(await sessionCount(bystander)).toBe(1);
  });

  it("refuses a non-Admin disabling an Admin and keeps their sessions", async () => {
    const actor = await actorWithRole("disabler@x.com", ["users.view", "users.disable"]);
    const target = await userNamed("boss@x.com");
    await assignConsoleRole(target, await adminRoleId());
    await insertSession(target);

    await expect(disableUser(getTestPool(), actor, target)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await statusOf(target)).toBe("active");
    expect(await sessionCount(target)).toBe(1);
  });

  it("returns 409 for a user who is already disabled", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com", "disabled");

    await expect(disableUser(getTestPool(), actor, target)).rejects.toBeInstanceOf(ConflictError);
  });
});

async function insertBrandRole(userId: string, grantedBy: string | null = null): Promise<string> {
  const suffix = randomBytes(4).toString("hex");
  const role = await getTestPool().query(`INSERT INTO roles (name, kind) VALUES ($1, 'brand') RETURNING id`, [
    `Brand role ${suffix}`,
  ]);
  const tenant = await getTestPool().query(`INSERT INTO tenants (name) VALUES ($1) RETURNING id`, [`T ${suffix}`]);
  const brand = await getTestPool().query(`INSERT INTO brands (tenant_id, name) VALUES ($1, 'B') RETURNING id`, [
    tenant.rows[0].id,
  ]);
  await getTestPool().query(
    `INSERT INTO user_brand_roles (user_id, brand_id, role_id, granted_by) VALUES ($1, $2, $3, $4)`,
    [userId, brand.rows[0].id, role.rows[0].id, grantedBy],
  );
  return brand.rows[0].id;
}

async function rowCounts(userId: string) {
  const result = await getTestPool().query(
    `
    SELECT
      (SELECT count(*)::int FROM users WHERE id = $1) AS users,
      (SELECT count(*)::int FROM user_sessions WHERE user_id = $1) AS sessions,
      (SELECT count(*)::int FROM user_identities WHERE user_id = $1) AS identities,
      (SELECT count(*)::int FROM user_console_roles WHERE user_id = $1) AS console_roles,
      (SELECT count(*)::int FROM user_brand_roles WHERE user_id = $1) AS brand_roles
    `,
    [userId],
  );
  return result.rows[0];
}

async function insertIdentity(userId: string): Promise<void> {
  await getTestPool().query(
    `INSERT INTO user_identities (user_id, provider, provider_subject) VALUES ($1, 'google', $2)`,
    [userId, randomBytes(8).toString("hex")],
  );
}

describe("deleteUser (integration)", () => {
  it("removes a disabled user with their sessions, identities and roles, keeping roles they granted", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com", "disabled");
    const grantee = await userNamed("carol@x.com");
    await insertSession(target);
    await insertIdentity(target);
    await assignConsoleRole(target, await insertRole("Viewer", ["users.view"]));
    await insertBrandRole(target);
    await getTestPool().query(`INSERT INTO user_console_roles (user_id, role_id, granted_by) VALUES ($1, $2, $3)`, [
      grantee,
      await insertRole("Granted", ["users.view"]),
      target,
    ]);
    await insertBrandRole(grantee, target);

    await deleteUser(getTestPool(), actor, target);

    expect(await rowCounts(target)).toEqual({ users: 0, sessions: 0, identities: 0, console_roles: 0, brand_roles: 0 });
    expect((await storedConsoleRole(grantee)).granted_by).toBeNull();
    const brandRole = await getTestPool().query(`SELECT granted_by FROM user_brand_roles WHERE user_id = $1`, [
      grantee,
    ]);
    expect(brandRole.rows).toEqual([{ granted_by: null }]);
  });

  it("returns 409 for an active user and deletes nothing", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com");
    await insertSession(target);

    await expect(deleteUser(getTestPool(), actor, target)).rejects.toBeInstanceOf(ConflictError);

    expect(await rowCounts(target)).toMatchObject({ users: 1, sessions: 1 });
  });

  it("refuses a non-Admin deleting a disabled Admin and deletes nothing", async () => {
    const actor = await actorWithRole("deleter@x.com", ["users.view", "users.delete"]);
    const target = await userNamed("boss@x.com", "disabled");
    await assignConsoleRole(target, await adminRoleId());

    await expect(deleteUser(getTestPool(), actor, target)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await rowCounts(target)).toMatchObject({ users: 1, console_roles: 1 });
  });
});

async function storedUser(userId: string) {
  const result = await getTestPool().query(
    `SELECT display_name, status, last_login_at, updated_at FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0];
}

describe("updateUser (integration)", () => {
  it("renames the user and bumps updated_at only", async () => {
    const actor = await actorWithRole("editor@x.com", ["users.view", "users.edit"]);
    const target = await userNamed("bob@x.com");
    const before = await storedUser(target);

    const user = await updateUser(getTestPool(), actor, target, { displayName: "  Bobby  " });

    const after = await storedUser(target);
    expect(user.displayName).toBe("Bobby");
    expect(after.display_name).toBe("Bobby");
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(after.status).toBe(before.status);
    expect(after.last_login_at).toEqual(before.last_login_at);
  });

  it("stores an empty name as NULL", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com");
    await updateUser(getTestPool(), actor, target, { displayName: "Bob" });

    const user = await updateUser(getTestPool(), actor, target, { displayName: "" });

    expect(user.displayName).toBeNull();
    expect((await storedUser(target)).display_name).toBeNull();
  });

  it("refuses a non-Admin editing an Admin and writes nothing", async () => {
    const actor = await actorWithRole("editor@x.com", ["users.view", "users.edit"]);
    const target = await userNamed("boss@x.com");
    await assignConsoleRole(target, await adminRoleId());
    const before = await storedUser(target);

    await expect(updateUser(getTestPool(), actor, target, { displayName: "Hacked" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    expect(await storedUser(target)).toEqual(before);
  });

  it("returns the real brand count", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com");
    const role = await getTestPool().query(`INSERT INTO roles (name, kind) VALUES ('Owner', 'brand') RETURNING id`);
    const tenant = await getTestPool().query(`INSERT INTO tenants (name) VALUES ('T') RETURNING id`);
    const brand = await getTestPool().query(`INSERT INTO brands (tenant_id, name) VALUES ($1, 'B') RETURNING id`, [
      tenant.rows[0].id,
    ]);
    await getTestPool().query(`INSERT INTO user_brand_roles (user_id, brand_id, role_id) VALUES ($1, $2, $3)`, [
      target,
      brand.rows[0].id,
      role.rows[0].id,
    ]);

    const user = await updateUser(getTestPool(), actor, target, { displayName: "Bob" });

    expect(user.brandCount).toBe(1);
  });

  it("counts only brands that are not soft-deleted and whose tenant is not soft-deleted", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("bob@x.com");
    await insertBrandRole(target);
    await softDeleteBrand(await insertBrandRole(target));
    await softDeleteTenantOf(await insertBrandRole(target));

    const user = await updateUser(getTestPool(), actor, target, { displayName: "Bob" });

    expect(user.brandCount).toBe(1);
  });

  it("refuses and keeps the name when the target became an Admin after the non-Admin's snapshot", async () => {
    const actor = await actorWithRole("editor@x.com", ["users.view", "users.edit"]);
    const target = await userNamed("bob@x.com");
    await assignConsoleRole(target, await insertRole("Viewer", ["users.view"]));
    const adminId = await adminRoleId();

    await expect(
      racingRoleChange(target, adminId, () => updateUser(getTestPool(), actor, target, { displayName: "Hacked" })),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect((await storedUser(target)).display_name).toBeNull();
  });

  it("lets an Admin edit an Admin", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userNamed("boss@x.com");
    await assignConsoleRole(target, await adminRoleId());

    const user = await updateUser(getTestPool(), actor, target, { displayName: "Boss" });

    expect(user.displayName).toBe("Boss");
    expect(user.consoleRole?.isBuiltin).toBe(true);
  });

  it("returns 404 for an unknown user", async () => {
    const actor = await adminActor("admin@x.com");

    await expect(
      updateUser(getTestPool(), actor, "99999999-9999-9999-9999-999999999999", { displayName: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

async function nameOf(userId: string) {
  const result = await getTestPool().query(`SELECT display_name, display_name_source FROM users WHERE id = $1`, [
    userId,
  ]);
  return result.rows[0];
}

async function userWithName(email: string, name: string | null, source: string | null, status = "invited") {
  const result = await getTestPool().query(
    `INSERT INTO users (email, display_name, display_name_source, status) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, name, source, status],
  );
  return result.rows[0].id as string;
}

function googleIdentity(email: string, name: string | null, subject = `sub-${email}`): VerifiedIdentity {
  return { provider: "google", subject, email, emailVerified: true, name };
}

describe("name source (integration)", () => {
  it("marks a name typed at invite as set by staff", async () => {
    const user = await inviteWithRole("bob@x.com", "Bob");

    expect(user.displayNameSource).toBe("staff");
    expect(await nameOf(user.id)).toEqual({ display_name: "Bob", display_name_source: "staff" });
  });

  it("leaves the source empty for an invite without a name", async () => {
    const user = await inviteWithRole("bob@x.com");

    expect(user.displayNameSource).toBeNull();
    expect(await nameOf(user.id)).toEqual({ display_name: null, display_name_source: null });
  });

  it("fills an empty name from Google at first sign-in and marks it as from the provider", async () => {
    const invited = await inviteWithRole("bob@x.com");

    await resolveUserFromIdentity(getTestPool(), googleIdentity("bob@x.com", "Bob Google"));

    expect(await nameOf(invited.id)).toEqual({ display_name: "Bob Google", display_name_source: "provider" });
  });

  it("keeps a staff name at first sign-in", async () => {
    const invited = await inviteWithRole("bob@x.com", "Bob");

    await resolveUserFromIdentity(getTestPool(), googleIdentity("bob@x.com", "Bob Google"));

    expect(await nameOf(invited.id)).toEqual({ display_name: "Bob", display_name_source: "staff" });
  });

  it("leaves name and source empty when Google sends no name", async () => {
    const invited = await inviteWithRole("bob@x.com");

    await resolveUserFromIdentity(getTestPool(), googleIdentity("bob@x.com", ""));

    expect(await nameOf(invited.id)).toEqual({ display_name: null, display_name_source: null });
  });

  it("fills an empty name for a known identity, and keeps a self-chosen or staff name", async () => {
    const empty = await userWithName("empty@x.com", null, null, "active");
    const chosen = await userWithName("chosen@x.com", "Chosen", "self", "active");
    const staff = await userWithName("staff@x.com", "Staff Name", "staff", "active");
    for (const [id, email] of [[empty, "empty@x.com"], [chosen, "chosen@x.com"], [staff, "staff@x.com"]]) {
      await getTestPool().query(
        `INSERT INTO user_identities (user_id, provider, provider_subject) VALUES ($1, 'google', $2)`,
        [id, `sub-${email}`],
      );
      await resolveUserFromIdentity(getTestPool(), googleIdentity(email, "From Google"));
    }

    expect(await nameOf(empty)).toEqual({ display_name: "From Google", display_name_source: "provider" });
    expect(await nameOf(chosen)).toEqual({ display_name: "Chosen", display_name_source: "self" });
    expect(await nameOf(staff)).toEqual({ display_name: "Staff Name", display_name_source: "staff" });
  });

  it("locks a name set in the Edit dialog and unlocks it when cleared", async () => {
    const actor = await adminActor("admin@x.com");
    const target = await userWithName("bob@x.com", "Bob Google", "provider", "active");

    const renamed = await updateUser(getTestPool(), actor, target, { displayName: "Robert" });
    expect(renamed.displayNameSource).toBe("staff");
    expect(await nameOf(target)).toEqual({ display_name: "Robert", display_name_source: "staff" });

    const cleared = await updateUser(getTestPool(), actor, target, { displayName: "  " });
    expect(cleared.displayNameSource).toBeNull();
    expect(await nameOf(target)).toEqual({ display_name: null, display_name_source: null });
  });
});

async function inviteWithRole(email: string, displayName?: string) {
  const actor = await adminActor("inviter@x.com");
  const consoleRoleId = await insertRole("Viewer", ["users.view"]);
  return inviteUser(getTestPool(), actor, { email, ...(displayName ? { displayName } : {}), consoleRoleId });
}

async function newBrandRole(name: string, actions: string[]): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH role AS (
      INSERT INTO roles (name, kind) VALUES ($1, 'brand') RETURNING id
    ),
    perms AS (
      INSERT INTO role_permissions (role_id, action)
      SELECT role.id, a.action FROM role, unnest($2::text[]) AS a(action)
    )
    SELECT id FROM role
    `,
    [name, actions],
  );
  return result.rows[0].id;
}

async function insertBrand(name: string): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH tenant AS (
      INSERT INTO tenants (name) VALUES ($1) RETURNING id
    )
    INSERT INTO brands (tenant_id, name) SELECT id, $1 FROM tenant RETURNING id
    `,
    [name],
  );
  return result.rows[0].id;
}

async function invitedRows(email: string) {
  const result = await getTestPool().query(
    `
    SELECT u.id,
           (SELECT json_build_object('role_id', ucr.role_id, 'granted_by', ucr.granted_by)
            FROM user_console_roles ucr WHERE ucr.user_id = u.id) AS console_role,
           (SELECT json_agg(
                     json_build_object('brand_id', ubr.brand_id, 'role_id', ubr.role_id, 'granted_by', ubr.granted_by)
                     ORDER BY ubr.brand_id)
            FROM user_brand_roles ubr WHERE ubr.user_id = u.id) AS brand_roles
    FROM users u WHERE u.email = $1
    `,
    [email],
  );
  return result.rows[0] ?? null;
}

async function assignmentCount(): Promise<number> {
  const result = await getTestPool().query(
    `SELECT (SELECT count(*) FROM user_console_roles) + (SELECT count(*) FROM user_brand_roles) AS n`,
  );
  return Number(result.rows[0].n);
}

const INVITER_ACTIONS: RequestAccess["consoleActions"] = [
  "users.view",
  "users.invite",
  "users.assignConsoleRoles",
  "users.assignBrandRoles",
];

describe("inviteUser (integration)", () => {
  it("creates the user with a console role only, granted by the actor", async () => {
    const actor = await actorWithRole("inviter@x.com", INVITER_ACTIONS);
    const roleId = await insertRole("Viewer", ["users.view"]);

    const user = await inviteUser(getTestPool(), actor, { email: "Bob@x.com", consoleRoleId: roleId });

    expect(user).toMatchObject({
      email: "bob@x.com",
      status: "invited",
      consoleRole: { id: roleId, name: "Viewer", isBuiltin: false },
      brandCount: 0,
    });
    expect(await invitedRows("bob@x.com")).toEqual({
      id: user.id,
      console_role: { role_id: roleId, granted_by: actor.user.id },
      brand_roles: null,
    });
  });

  it("creates the user with brand roles only", async () => {
    const actor = await actorWithRole("inviter@x.com", INVITER_ACTIONS);
    const [first, second] = [await insertBrand("Alpha"), await insertBrand("Beta")].sort();
    const roleId = await newBrandRole("Manager", ["outlets.view"]);

    const user = await inviteUser(getTestPool(), actor, {
      email: "bob@x.com",
      brandRoles: [
        { brandId: second, roleId },
        { brandId: first, roleId },
      ],
    });

    expect(user).toMatchObject({ consoleRole: null, brandCount: 2 });
    expect(await invitedRows("bob@x.com")).toEqual({
      id: user.id,
      console_role: null,
      brand_roles: [
        { brand_id: first, role_id: roleId, granted_by: actor.user.id },
        { brand_id: second, role_id: roleId, granted_by: actor.user.id },
      ],
    });
  });

  it("creates the user with a console role and a brand role", async () => {
    const actor = await adminActor("admin@x.com");
    const adminRole = await adminRoleId();
    const brandId = await insertBrand("Alpha");
    const brandRoleId = await newBrandRole("Manager", ["outlets.view"]);

    const user = await inviteUser(getTestPool(), actor, {
      email: "bob@x.com",
      displayName: "Bob",
      consoleRoleId: adminRole,
      brandRoles: [{ brandId, roleId: brandRoleId }],
    });

    expect(user).toMatchObject({
      displayName: "Bob",
      displayNameSource: "staff",
      consoleRole: { id: adminRole, isBuiltin: true },
      brandCount: 1,
    });
    expect(await invitedRows("bob@x.com")).toEqual({
      id: user.id,
      console_role: { role_id: adminRole, granted_by: actor.user.id },
      brand_roles: [{ brand_id: brandId, role_id: brandRoleId, granted_by: actor.user.id }],
    });
  });

  it("writes nothing when a non-Admin gives the Admin role", async () => {
    const actor = await actorWithRole("inviter@x.com", INVITER_ACTIONS);
    const adminRole = await adminRoleId();
    const brandId = await insertBrand("Alpha");
    const brandRoleId = await newBrandRole("Manager", ["outlets.view"]);
    const before = await assignmentCount();

    await expect(
      inviteUser(getTestPool(), actor, {
        email: "bob@x.com",
        consoleRoleId: adminRole,
        brandRoles: [{ brandId, roleId: brandRoleId }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await invitedRows("bob@x.com")).toBeNull();
    expect(await assignmentCount()).toBe(before);
  });

  it("writes nothing for a console role broader than the actor", async () => {
    const actor = await actorWithRole("inviter@x.com", INVITER_ACTIONS);
    const broader = await insertRole("Broader", ["users.view", "users.delete"]);
    const before = await assignmentCount();

    await expect(
      inviteUser(getTestPool(), actor, { email: "bob@x.com", consoleRoleId: broader }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await invitedRows("bob@x.com")).toBeNull();
    expect(await assignmentCount()).toBe(before);
  });

  it("writes nothing when a console role is passed as a brand role", async () => {
    const actor = await actorWithRole("inviter@x.com", INVITER_ACTIONS);
    const consoleRoleId = await insertRole("Viewer", ["users.view"]);
    const brandId = await insertBrand("Alpha");
    const before = await assignmentCount();

    await expect(
      inviteUser(getTestPool(), actor, {
        email: "bob@x.com",
        consoleRoleId,
        brandRoles: [{ brandId, roleId: consoleRoleId }],
      }),
    ).rejects.toThrow(new NotFoundError("Role not found."));

    expect(await invitedRows("bob@x.com")).toBeNull();
    expect(await assignmentCount()).toBe(before);
  });

  it("writes nothing for a soft-deleted brand or a brand of a soft-deleted tenant", async () => {
    const actor = await actorWithRole("inviter@x.com", INVITER_ACTIONS);
    const deletedBrand = await insertBrand("Alpha");
    const tenantDeletedBrand = await insertBrand("Beta");
    const roleId = await newBrandRole("Manager", ["outlets.view"]);
    await getTestPool().query(`UPDATE brands SET deleted_at = now() WHERE id = $1`, [deletedBrand]);
    await getTestPool().query(
      `UPDATE tenants SET deleted_at = now() WHERE id = (SELECT tenant_id FROM brands WHERE id = $1)`,
      [tenantDeletedBrand],
    );
    const before = await assignmentCount();

    for (const brandId of [deletedBrand, tenantDeletedBrand]) {
      await expect(
        inviteUser(getTestPool(), actor, { email: "bob@x.com", brandRoles: [{ brandId, roleId }] }),
      ).rejects.toThrow(new NotFoundError("Brand not found."));
    }

    expect(await invitedRows("bob@x.com")).toBeNull();
    expect(await assignmentCount()).toBe(before);
  });

  it("returns 409 for a taken email and writes no assignment", async () => {
    const actor = await adminActor("admin@x.com");
    const existing = await userNamed("bob@x.com");
    const roleId = await insertRole("Viewer", ["users.view"]);
    const brandId = await insertBrand("Alpha");
    const brandRoleId = await newBrandRole("Manager", ["outlets.view"]);

    await expect(
      inviteUser(getTestPool(), actor, {
        email: "bob@x.com",
        consoleRoleId: roleId,
        brandRoles: [{ brandId, roleId: brandRoleId }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await invitedRows("bob@x.com")).toEqual({ id: existing, console_role: null, brand_roles: null });
  });
});
