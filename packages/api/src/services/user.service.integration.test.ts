import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import type { RequestAccess } from "./authorization.service.js";
import { clearConsoleRole, disableUser, setConsoleRole, updateUser } from "./user.service.js";

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
    const adminId = await adminRoleId();

    await expect(
      racingRoleChange(target, adminId, () => clearConsoleRole(getTestPool(), actor, target)),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await storedConsoleRole(target)).toEqual({ role_id: adminId, granted_by: null });
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
