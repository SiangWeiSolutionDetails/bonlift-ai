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
  deleteUser,
  disableUser,
  inviteUser,
  listUsers,
  reinviteUser,
  resolveUserFromIdentity,
  setConsoleRole,
  updateUser,
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
    expect(sql).toMatch(
      /display_name_source = CASE\s+WHEN u\.display_name IS NULL AND NULLIF\(\$3, ''\) IS NOT NULL THEN 'provider'\s+ELSE u\.display_name_source\s+END/,
    );
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
    expect(activateSql).toMatch(
      /display_name_source = CASE\s+WHEN display_name IS NULL AND NULLIF\(\$2, ''\) IS NOT NULL THEN 'provider'\s+ELSE display_name_source\s+END/,
    );
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
    display_name_source: "staff",
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
  displayNameSource: "staff",
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
    written: true,
    ...userRow(),
    ...overrides,
  };
}

function clearFlags(overrides: Record<string, unknown> = {}) {
  return { target_found: true, target_is_admin: false, current_subset: true, written: true, ...overrides };
}

function statusFlags(overrides: Record<string, unknown> = {}) {
  return { target_found: true, target_is_admin: false, ...userRow(), ...overrides };
}

describe("self checks", () => {
  const OWN_ID_UPPERCASE = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
  const lowercaseActor = { ...admin, user: { ...admin.user, id: OWN_ID_UPPERCASE.toLowerCase() } };

  it("refuses your own console role given as an uppercase UUID", async () => {
    await expect(setConsoleRole(fakePool, lowercaseActor, OWN_ID_UPPERCASE, ROLE_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("refuses clearing your own console role given as an uppercase UUID", async () => {
    await expect(clearConsoleRole(fakePool, lowercaseActor, OWN_ID_UPPERCASE)).rejects.toBeInstanceOf(ForbiddenError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("refuses disabling yourself given as an uppercase UUID", async () => {
    await expect(disableUser(fakePool, lowercaseActor, OWN_ID_UPPERCASE)).rejects.toBeInstanceOf(ForbiddenError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("refuses deleting yourself given as an uppercase UUID", async () => {
    await expect(deleteUser(fakePool, lowercaseActor, OWN_ID_UPPERCASE)).rejects.toBeInstanceOf(ForbiddenError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });
});

describe("listUsers", () => {
  it("maps each user with their console role and brand count", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([
        userRow(),
        userRow({
          id: USER_ID,
          email: "new@x.com",
          display_name: null,
          display_name_source: null,
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
        displayNameSource: null,
        status: "invited",
        lastLoginAt: null,
        consoleRole: null,
        brandCount: 0,
      },
    ]);
  });
});

describe("inviteUser", () => {
  const BRAND_ID = "55555555-5555-5555-5555-555555555555";
  const BRAND_ROLE_ID = "66666666-6666-6666-6666-666666666666";
  const OTHER_BRAND_ID = "77777777-7777-7777-7777-777777777777";
  const inviter = actorWith(["users.view", "users.invite", "users.assignConsoleRoles", "users.assignBrandRoles"]);
  const withConsoleRole = { consoleRoleId: ROLE_ID };

  function inviteFlags(overrides: Record<string, unknown> = {}) {
    return {
      console_role_found: true,
      console_role_builtin: false,
      console_subset: true,
      brand_roles_found: true,
      brands_found: true,
      ...userRow({ status: "invited", last_login_at: null, brand_count: "0" }),
      ...overrides,
    };
  }

  it("lowercases the email and binds the console role", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([inviteFlags()]));

    const user = await inviteUser(fakePool, inviter, { email: "Bob@X.com", displayName: "Bob", ...withConsoleRole });

    expect(poolQueryMock.mock.calls[0][1]).toEqual([
      "bob@x.com",
      "Bob",
      "staff",
      ACTOR_ID,
      ROLE_ID,
      [],
      [],
      false,
      inviter.consoleActions,
    ]);
    expect(user).toMatchObject({
      email: "bob@x.com",
      status: "invited",
      consoleRole: { id: ROLE_ID, name: "Support", isBuiltin: false },
      brandCount: 0,
    });
  });

  it("binds brand roles as parallel uuid arrays and returns the brand count", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([inviteFlags({ ...noRole, brand_count: "2" })]));

    const user = await inviteUser(fakePool, inviter, {
      email: "bob@x.com",
      brandRoles: [
        { brandId: BRAND_ID, roleId: BRAND_ROLE_ID },
        { brandId: OTHER_BRAND_ID, roleId: BRAND_ROLE_ID },
      ],
    });

    const [sql, params] = poolQueryMock.mock.calls[0];
    expect(sql).toMatch(/unnest\(\$6::uuid\[\], \$7::uuid\[\]\)/);
    expect(params.slice(4, 7)).toEqual([null, [BRAND_ID, OTHER_BRAND_ID], [BRAND_ROLE_ID, BRAND_ROLE_ID]]);
    expect(user).toMatchObject({ consoleRole: null, brandCount: 2 });
  });

  it("marks a typed name as set by staff and maps the source", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([inviteFlags()]));

    const user = await inviteUser(fakePool, inviter, { email: "bob@x.com", displayName: "Bob", ...withConsoleRole });

    expect(poolQueryMock.mock.calls[0][0]).toMatch(/display_name_source/);
    expect(user.displayNameSource).toBe("staff");
  });

  it("leaves the source empty without a name", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([inviteFlags({ display_name: null, display_name_source: null })]));

    const user = await inviteUser(fakePool, inviter, { email: "bob@x.com", ...withConsoleRole });

    expect(poolQueryMock.mock.calls[0][1].slice(0, 3)).toEqual(["bob@x.com", null, null]);
    expect(user.displayNameSource).toBeNull();
  });

  it("refuses an invite without any role, before any query", async () => {
    await expect(inviteUser(fakePool, inviter, { email: "bob@x.com" })).rejects.toThrow(
      new ValidationError("Assign at least one role."),
    );
    await expect(inviteUser(fakePool, inviter, { email: "bob@x.com", brandRoles: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("refuses a console role without users.assignConsoleRoles, before any query", async () => {
    const actor = actorWith(["users.invite", "users.assignBrandRoles"]);

    await expect(inviteUser(fakePool, actor, { email: "bob@x.com", ...withConsoleRole })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("refuses brand roles without users.assignBrandRoles, before any query", async () => {
    const actor = actorWith(["users.invite", "users.assignConsoleRoles"]);

    await expect(
      inviteUser(fakePool, actor, { email: "bob@x.com", brandRoles: [{ brandId: BRAND_ID, roleId: BRAND_ROLE_ID }] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("refuses the same brand twice, in any letter case, before any query", async () => {
    await expect(
      inviteUser(fakePool, inviter, {
        email: "bob@x.com",
        brandRoles: [
          { brandId: BRAND_ID, roleId: BRAND_ROLE_ID },
          { brandId: OTHER_BRAND_ID.toUpperCase(), roleId: BRAND_ROLE_ID },
          { brandId: OTHER_BRAND_ID, roleId: ROLE_ID },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email", async () => {
    await expect(inviteUser(fakePool, inviter, { email: "not-an-email", ...withConsoleRole })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the console role is missing", { console_role_found: false }, "Role not found."],
    ["a brand role is missing", { brand_roles_found: false }, "Role not found."],
    ["a brand is missing", { brands_found: false }, "Brand not found."],
  ])("returns 404 when %s", async (_case, flags, message) => {
    poolQueryMock.mockResolvedValueOnce(pgResult([inviteFlags({ ...flags, id: null })]));

    await expect(inviteUser(fakePool, inviter, { email: "bob@x.com", ...withConsoleRole })).rejects.toThrow(
      new NotFoundError(message),
    );
  });

  it("checks a missing role before the Admin rule", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([inviteFlags({ brand_roles_found: false, console_role_builtin: true, id: null })]),
    );

    await expect(inviteUser(fakePool, inviter, { email: "bob@x.com", ...withConsoleRole })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it.each([
    ["the Admin role", { console_role_builtin: true }],
    ["a broader console role", { console_subset: false }],
  ])("returns 403 for a non-Admin giving %s", async (_case, flags) => {
    poolQueryMock.mockResolvedValueOnce(pgResult([inviteFlags({ ...flags, id: null })]));

    await expect(inviteUser(fakePool, inviter, { email: "bob@x.com", ...withConsoleRole })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("lets an Admin give the Admin role", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([inviteFlags({ console_role_builtin: true, console_subset: false, role_is_builtin: true })]),
    );

    const user = await inviteUser(fakePool, admin, { email: "bob@x.com", ...withConsoleRole });

    expect(poolQueryMock.mock.calls[0][1][7]).toBe(true);
    expect(user.consoleRole?.isBuiltin).toBe(true);
  });

  it("returns 409 for a duplicate email", async () => {
    poolQueryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION, constraint: "users_email_key" });

    await expect(inviteUser(fakePool, inviter, { email: "bob@x.com", ...withConsoleRole })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("maps the lowercase check to a validation error", async () => {
    poolQueryMock.mockRejectedValueOnce({ code: CHECK_VIOLATION, constraint: "users_email_check" });

    await expect(inviteUser(fakePool, inviter, { email: "bob@x.com", ...withConsoleRole })).rejects.toBeInstanceOf(
      ValidationError,
    );
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

  it("returns 409 when the user's role changed before the write", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([consoleRoleFlags({ written: false })]));

    await expect(setConsoleRole(fakePool, userManager, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(ConflictError);
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

  it("returns 409 when the user's role changed before the delete", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([clearFlags({ written: false })]));

    await expect(clearConsoleRole(fakePool, userManager, TARGET_ID)).rejects.toBeInstanceOf(ConflictError);
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

function deleteFlags(overrides: Record<string, unknown> = {}) {
  return { target_found: true, target_disabled: true, target_is_admin: false, deleted: true, ...overrides };
}

describe("deleteUser", () => {
  const deleter = actorWith(["users.view", "users.delete"]);

  it("refuses to delete yourself", async () => {
    await expect(deleteUser(fakePool, admin, ACTOR_ID)).rejects.toThrow("You cannot delete yourself.");
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("deletes a disabled user in one statement", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([deleteFlags()]));

    await deleteUser(fakePool, deleter, TARGET_ID);

    expect(poolQueryMock.mock.calls[0][0]).toMatch(/DELETE FROM users/);
    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, false]);
  });

  it("returns 404 for an unknown user", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([deleteFlags({ target_found: false, target_disabled: false, deleted: false })]),
    );

    await expect(deleteUser(fakePool, deleter, TARGET_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a non-Admin deleting an Admin", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([deleteFlags({ target_is_admin: true, deleted: false })]));

    await expect(deleteUser(fakePool, deleter, TARGET_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns 409 for a user who is not disabled", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([deleteFlags({ target_disabled: false, deleted: false })]));

    await expect(deleteUser(fakePool, deleter, TARGET_ID)).rejects.toThrow("Disable the user before deleting them.");
  });

  it("returns 409 when the user stopped being disabled before the delete", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([deleteFlags({ deleted: false })]));

    await expect(deleteUser(fakePool, deleter, TARGET_ID)).rejects.toBeInstanceOf(ConflictError);
  });

  it("lets an Admin delete a disabled Admin", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([deleteFlags({ target_is_admin: true })]));

    await deleteUser(fakePool, admin, TARGET_ID);

    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, true]);
  });
});

describe("updateUser", () => {
  const editor = actorWith(["users.view", "users.edit"]);

  it("trims the name and returns the user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ display_name: "Bobby" })]));

    const user = await updateUser(fakePool, editor, TARGET_ID, { displayName: "  Bobby  " });

    expect(user).toEqual({ ...expectedUser, displayName: "Bobby" });
    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, "Bobby", false, "staff"]);
  });

  it("writes the name source with the name", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags()]));

    await updateUser(fakePool, editor, TARGET_ID, { displayName: "Bob" });

    expect(poolQueryMock.mock.calls[0][0]).toMatch(/display_name_source = \$4/);
  });

  it("stores an empty name as null", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ display_name: null })]));

    await updateUser(fakePool, editor, TARGET_ID, { displayName: "   " });

    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, null, false, null]);
  });

  it("stores null as null", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ display_name: null })]));

    await updateUser(fakePool, editor, TARGET_ID, { displayName: null });

    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, null, false, null]);
  });

  it("refuses a non-Admin editing an Admin", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ target_is_admin: true, id: null })]));

    await expect(updateUser(fakePool, editor, TARGET_ID, { displayName: "X" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an Admin edit an Admin", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ target_is_admin: true, display_name: "X" })]));

    const user = await updateUser(fakePool, admin, TARGET_ID, { displayName: "X" });

    expect(user.displayName).toBe("X");
    expect(poolQueryMock.mock.calls[0][1]).toEqual([TARGET_ID, "X", true, "staff"]);
  });

  it("returns 404 for an unknown user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ target_found: false, id: null })]));

    await expect(updateUser(fakePool, editor, TARGET_ID, { displayName: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets a user edit their own name", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([statusFlags({ id: ACTOR_ID })]));

    await updateUser(fakePool, editor, ACTOR_ID, { displayName: "Me" });

    expect(poolQueryMock.mock.calls[0][1]).toEqual([ACTOR_ID, "Me", false, "staff"]);
  });

  it("rejects a name over 200 characters", async () => {
    await expect(updateUser(fakePool, editor, TARGET_ID, { displayName: "x".repeat(201) })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(poolQueryMock).not.toHaveBeenCalled();
  });
});
