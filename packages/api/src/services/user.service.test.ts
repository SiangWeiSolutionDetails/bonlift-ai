import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountNotApprovedError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { resolveUserFromIdentity, type VerifiedIdentity } from "./user.service.js";

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
    expect(sql).toMatch(/COALESCE\(\s*u\.display_name/);
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

    await expect(resolveUserFromIdentity(fakePool, identity)).rejects.toBeInstanceOf(
      AccountNotApprovedError,
    );
    expect(connectMock).not.toHaveBeenCalled();
  });
});

describe("resolveUserFromIdentity — first link", () => {
  it("refuses an unverified email without opening a transaction", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([unknownRow]));

    await expect(
      resolveUserFromIdentity(fakePool, { ...identity, emailVerified: false }),
    ).rejects.toBeInstanceOf(AccountNotApprovedError);
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
    expect(activateParams[0]).toBe("alice@x.com");
    expect(clientQueryMock.mock.calls[2][1]).toEqual([USER_ID, "google", "google-sub-1"]);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("refuses when no invited row matches and rolls back", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([unknownRow]));
    clientQueryMock.mockResolvedValueOnce(pgResult([])).mockResolvedValue(pgResult([], 0));

    await expect(resolveUserFromIdentity(fakePool, identity)).rejects.toBeInstanceOf(
      AccountNotApprovedError,
    );
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

    await expect(resolveUserFromIdentity(fakePool, identity)).rejects.toBeInstanceOf(
      AccountNotApprovedError,
    );
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

    await expect(resolveUserFromIdentity(fakePool, identity)).rejects.toBeInstanceOf(
      AccountNotApprovedError,
    );
  });

  it("rethrows unrelated database errors", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([unknownRow]));
    const boom = new Error("connection reset");
    clientQueryMock.mockResolvedValueOnce(pgResult([])).mockRejectedValueOnce(boom).mockResolvedValue(pgResult([]));

    await expect(resolveUserFromIdentity(fakePool, identity)).rejects.toBe(boom);
  });
});
