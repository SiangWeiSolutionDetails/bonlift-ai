import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountNotApprovedError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { CHECK_VIOLATION, UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import type { RequestAccess } from "./authorization.service.js";
import {
  clearConsoleRole,
  disableUser,
  inviteUser,
  listUsers,
  reinviteUser,
  resolveUserFromIdentity,
  setConsoleRole,
  type VerifiedIdentity,
} from "./user.service.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const poolQueryMock = vi.fn();
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn();
const fakePool = { query: poolQueryMock, connect: connectMock } as any;

const identity: VerifiedIdentity = {
  provider: "google",
  subject: "google-sub-1",
  email: "Alice@X.com",
  emailVerified: true,
  name: "Alice",
};

const knownRow = (overrides: Record<string, unknown> = {}) => ({
  identity_exists: true,
  id: USER_ID,
  email: "alice@x.com",
  display_name: "Alice",
  ...overrides,
});

const unknownRow = { identity_exists: false, id: null, email: null, display_name: null };

function clientStatements(): string[] {
  return clientQueryMock.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0]);
}

function uniqueViolation(constraint: string) {
  return Object.assign(new Error("duplicate key"), { code: "23505", constraint });
}

async function expectRefusal(promise: Promise<unknown>, reason: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AccountNotApprovedError);
  expect((error as AccountNotApprovedError).reason).toBe(reason);
}

beforeEach(() => {
  poolQueryMock.mockReset();
  clientQueryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockReset();
  connectMock.mockResolvedValue({ query: clientQueryMock, release: releaseMock });
});

describe("resolveUserFromIdentity — known identity", () => {
  it("returns an active user, setting last_login_at and filling a null display_name", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([knownRow()]));

    const user = await resolveUserFromIdentity(fakePool, identity);

    expect(user).toEqual({ id: USER_ID, email: "alice@x.com", displayName: "Alice" });
    const [sql, params] = poolQueryMock.mock.calls[0];
    expect(sql).toMatch(/last_login_at\s*=\s*now\(\)/);
    expect(sql).toMatch(/COALESCE\(\s*u\.display_name, NULLIF\(\$3, ''\)\)/);
    expect(sql).toMatch(/status IN \('active', 'invited'\)/);
    expect(params).toEqual(["google", "google-sub-1", "Alice"]);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("activates and returns a reinvited user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([knownRow()]));

    const user = await resolveUserFromIdentity(fakePool, identity);

    expect(user.id).toBe(USER_ID);
    expect(poolQueryMock.mock.calls[0][0]).toMatch(/status\s*=\s*'active'/);
  });

  it("refuses a disabled user", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([knownRow({ id: null, email: null, display_name: null })]),
    );

    await expectRefusal(resolveUserFromIdentity(fakePool, identity), "disabled");
    expect(connectMock).not.toHaveBeenCalled();
  });
});

describe("resolveUserFromIdentity — first link", () => {
  it("refuses an unverified email without opening a transaction", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([unknownRow]));

    await expectRefusal(
      resolveUserFromIdentity(fakePool, { ...identity, emailVerified: false }),
      "email_unverified",
    );
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("activates the invited user by lowercased email and links the identity in one transaction", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([unknownRow]));
    clientQueryMock
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(
        pgResult([{ id: USER_ID, email: "alice@x.com", display_name: "Alice" }]),
      )
      .mockResolvedValueOnce(pgResult([], 1))
      .mockResolvedValueOnce(pgResult([]));

    const user = await resolveUserFromIdentity(fakePool, identity);

    expect(user).toEqual({ id: USER_ID, email: "alice@x.com", displayName: "Alice" });
    expect(clientStatements()).toEqual(["BEGIN", "UPDATE", "INSERT", "COMMIT"]);
    const [activateSql, activateParams] = clientQueryMock.mock.calls[1];
    expect(activateSql).toMatch(/status = 'invited'/);
    expect(activateSql).toMatch(/COALESCE\(display_name, NULLIF\(\$2, ''\)\)/);
    expect(activateParams[0]).toBe("alice@x.com");
    expect(clientQueryMock.mock.calls[2][1]).toEqual([USER_ID, "google", "google-sub-1"]);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("refuses an unlisted email after rolling back and re-reading", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([unknownRow]))
      .mockResolvedValueOnce(pgResult([unknownRow]));
    clientQueryMock.mockResolvedValueOnce(pgResult([])).mockResolvedValue(pgResult([], 0));

    await expectRefusal(resolveUserFromIdentity(fakePool, identity), "unlisted");
    expect(clientStatements()).toContain("ROLLBACK");
    expect(clientStatements()).not.toContain("INSERT");
    expect(poolQueryMock.mock.calls[1][1]).toEqual(["google", "google-sub-1", "Alice"]);
  });

  it("signs in through the identity a racing first sign-in linked (activate matches zero rows)", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([unknownRow]))
      .mockResolvedValueOnce(pgResult([knownRow()]));
    clientQueryMock.mockResolvedValueOnce(pgResult([])).mockResolvedValue(pgResult([], 0));

    const user = await resolveUserFromIdentity(fakePool, identity);

    expect(user).toEqual({ id: USER_ID, email: "alice@x.com", displayName: "Alice" });
    expect(clientStatements()).toContain("ROLLBACK");
    expect(clientStatements()).not.toContain("INSERT");
  });

  it("refuses an invited user who already has another Google identity", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([unknownRow]));
    clientQueryMock
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(
        pgResult([{ id: USER_ID, email: "alice@x.com", display_name: "Alice" }]),
      )
      .mockRejectedValueOnce(uniqueViolation("user_identities_user_provider_key"))
      .mockResolvedValue(pgResult([]));

    await expectRefusal(resolveUserFromIdentity(fakePool, identity), "second_account");
    expect(clientStatements()).toContain("ROLLBACK");
  });

  it("re-runs the known-identity path after a racing first sign-in", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([unknownRow]))
      .mockResolvedValueOnce(pgResult([knownRow()]));
    clientQueryMock
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(
        pgResult([{ id: USER_ID, email: "alice@x.com", display_name: "Alice" }]),
      )
      .mockRejectedValueOnce(uniqueViolation("user_identities_pkey"))
      .mockResolvedValue(pgResult([]));

    const user = await resolveUserFromIdentity(fakePool, identity);

    expect(user).toEqual({ id: USER_ID, email: "alice@x.com", displayName: "Alice" });
    expect(clientStatements()).toContain("ROLLBACK");
    expect(poolQueryMock.mock.calls[1][1]).toEqual(["google", "google-sub-1", "Alice"]);
  });

  it("refuses when the re-read after a race finds no signable user", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([unknownRow]))
      .mockResolvedValueOnce(pgResult([knownRow({ id: null, email: null, display_name: null })]));
    clientQueryMock
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(
        pgResult([{ id: USER_ID, email: "alice@x.com", display_name: "Alice" }]),
      )
      .mockRejectedValueOnce(uniqueViolation("user_identities_pkey"))
      .mockResolvedValue(pgResult([]));

    await expectRefusal(resolveUserFromIdentity(fakePool, identity), "disabled");
  });

  it("rethrows unrelated database errors", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([unknownRow]));
    const boom = new Error("connection reset");
    clientQueryMock.mockResolvedValueOnce(pgResult([])).mockRejectedValueOnce(boom).mockResolvedValue(pgResult([]));

    await expect(resolveUserFromIdentity(fakePool, identity)).rejects.toBe(boom);
  });
});

const ACTOR_ID = "22222222-2222-2222-2222-222222222222";
const TARGET_ID = "33333333-3333-3333-3333-333333333333";
const ROLE_ID = "44444444-4444-4444-4444-444444444444";
const LOGIN_AT = new Date("2026-11-17T08:00:00.000Z");

function actorWith(consoleActions: RequestAccess["consoleActions"], isAdmin = false): RequestAccess {
  return { user: { id: ACTOR_ID, email: "lead@x.com", displayName: null }, isAdmin, consoleActions };
}

const admin = actorWith([...CONSOLE_ACTIONS], true);
const userManager = actorWith(["users.view", "users.invite", "users.disable", "users.assignConsoleRoles"]);

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    email: "bob@x.com",
    display_name: "Bob",
    status: "active",
    last_login_at: LOGIN_AT,
    role_id: ROLE_ID,
    role_name: "Support",
    role_is_builtin: false,
    brand_count: "2",
    ...overrides,
  };
}

const expectedUser = {
  id: TARGET_ID,
  email: "bob@x.com",
  displayName: "Bob",
  status: "active",
  lastLoginAt: "2026-11-17T08:00:00.000Z",
  consoleRole: { id: ROLE_ID, name: "Support", isBuiltin: false },
  brandCount: 2,
};

const noRole = { role_id: null, role_name: null, role_is_builtin: null };

function consoleRoleFlags(overrides: Record<string, unknown> = {}) {
  return {
    target_found: true,
    role_found: true,
    role_builtin: false,
    target_is_admin: false,
    new_subset: true,
    current_subset: true,
    ...userRow(),
    ...overrides,
  };
}

function clearFlags(overrides: Record<string, unknown> = {}) {
  return { target_found: true, target_is_admin: false, current_subset: true, ...overrides };
}

function statusFlags(overrides: Record<string, unknown> = {}) {
  return { target_found: true, target_is_admin: false, ...userRow(), ...overrides };
}

describe("listUsers", () => {
  it("maps each user with their console role and brand count", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([
        userRow(),
        userRow({
          id: USER_ID,
          email: "new@x.com",
          display_name: null,
          status: "invited",
          last_login_at: null,
          ...noRole,
          brand_count: "0",
        }),
      ]),
    );

    const users = await listUsers(fakePool);

    expect(users).toEqual([
      expectedUser,
      {
        id: USER_ID,
        email: "new@x.com",
        displayName: null,
        status: "invited",
        lastLoginAt: null,
        consoleRole: null,
        brandCount: 0,
      },
    ]);
  });
});

describe("inviteUser", () => {
  it("lowercases the email", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([userRow({ status: "invited", last_login_at: null, ...noRole, brand_count: 0 })]),
    );

    const user = await inviteUser(fakePool, { email: "Bob@X.com", displayName: "Bob" });

    expect(poolQueryMock.mock.calls[0][1]).toEqual(["bob@x.com", "Bob"]);
    expect(user).toMatchObject({ email: "bob@x.com", status: "invited", consoleRole: null, brandCount: 0 });
  });

  it("returns 409 for a duplicate email", async () => {
    poolQueryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION, constraint: "users_email_key" });

    await expect(inviteUser(fakePool, { email: "bob@x.com" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("returns 400 for an invalid email", async () => {
    await expect(inviteUser(fakePool, { email: "not-an-email" })).rejects.toBeInstanceOf(ValidationError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("maps the lowercase check to a validation error", async () => {
    poolQueryMock.mockRejectedValueOnce({ code: CHECK_VIOLATION, constraint: "users_email_check" });

    await expect(inviteUser(fakePool, { email: "bob@x.com" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("setConsoleRole", () => {
  it("refuses to change your own console role", async () => {
    await expect(setConsoleRole(fakePool, admin, ACTOR_ID, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("assigns the role in one statement and returns the user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([consoleRoleFlags()]));

    const user = await setConsoleRole(fakePool, userManager, TARGET_ID, ROLE_ID);

    expect(user).toEqual(expectedUser);
    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, ROLE_ID, ACTOR_ID, false, userManager.consoleActions]);
  });

  it("refuses a non-Admin assigning the Admin role", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([consoleRoleFlags({ role_builtin: true })]));

    await expect(setConsoleRole(fakePool, userManager, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a non-Admin replacing or clearing an Admin's role", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([consoleRoleFlags({ target_is_admin: true })]))
      .mockResolvedValueOnce(pgResult([clearFlags({ target_is_admin: true })]));

    await expect(setConsoleRole(fakePool, userManager, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(clearConsoleRole(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a console role with actions the actor lacks", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([consoleRoleFlags({ new_subset: false })]));

    await expect(setConsoleRole(fakePool, userManager, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses replacing a current role with actions the actor lacks", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([consoleRoleFlags({ current_subset: false })]));

    await expect(setConsoleRole(fakePool, userManager, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an Admin assign the Admin role over an Admin", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([
        consoleRoleFlags({
          role_builtin: true,
          target_is_admin: true,
          new_subset: false,
          role_name: "Admin",
          role_is_builtin: true,
        }),
      ]),
    );

    const user = await setConsoleRole(fakePool, admin, TARGET_ID, ROLE_ID);

    expect(user.consoleRole).toEqual({ id: ROLE_ID, name: "Admin", isBuiltin: true });
    expect(poolQueryMock.mock.calls[0][1][3]).toBe(true);
  });

  it("returns 404 for an unknown user or role", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([consoleRoleFlags({ target_found: false, role_builtin: true })]))
      .mockResolvedValueOnce(pgResult([consoleRoleFlags({ role_found: false, target_is_admin: true })]));

    await expect(setConsoleRole(fakePool, userManager, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setConsoleRole(fakePool, userManager, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("clearConsoleRole", () => {
  it("refuses to clear your own console role", async () => {
    await expect(clearConsoleRole(fakePool, admin, ACTOR_ID)).rejects.toBeInstanceOf(ForbiddenError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("refuses clearing a role with actions the actor lacks", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([clearFlags({ current_subset: false })]));

    await expect(clearConsoleRole(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns 404 for an unknown user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([clearFlags({ target_found: false })]));

    await expect(clearConsoleRole(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("clears the role in one statement", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([clearFlags()]));

    await clearConsoleRole(fakePool, userManager, TARGET_ID);

    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, false, userManager.consoleActions]);
  });
});

describe("disableUser", () => {
  it("refuses to disable yourself", async () => {
    await expect(disableUser(fakePool, admin, ACTOR_ID)).rejects.toBeInstanceOf(ForbiddenError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("disables the user and returns them", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ status: "disabled" })]));

    const user = await disableUser(fakePool, userManager, TARGET_ID);

    expect(user).toEqual({ ...expectedUser, status: "disabled" });
    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, false]);
  });

  it("returns 409 when the user is already disabled", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ id: null })]));

    await expect(disableUser(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(ConflictError);
  });

  it("returns 404 for an unknown user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ target_found: false, id: null })]));

    await expect(disableUser(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("reinviteUser", () => {
  it("sets a disabled user back to invited", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ status: "invited" })]));

    const user = await reinviteUser(fakePool, userManager, TARGET_ID);

    expect(user.status).toBe("invited");
    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, false]);
  });

  it("returns 409 for a user who is not disabled", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ id: null })]));

    await expect(reinviteUser(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("Admin targets", () => {
  it("refuses a non-Admin disabling or reinviting an Admin", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([statusFlags({ target_is_admin: true, id: null })]))
      .mockResolvedValueOnce(pgResult([statusFlags({ target_is_admin: true, id: null })]));

    await expect(disableUser(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reinviteUser(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an Admin disable an Admin", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ target_is_admin: true, status: "disabled" })]));

    const user = await disableUser(fakePool, admin, TARGET_ID);

    expect(user.status).toBe("disabled");
    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, true]);
  });
});
