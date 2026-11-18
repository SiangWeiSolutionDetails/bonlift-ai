import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forgetAccount,
  parseKnownAccounts,
  readKnownAccounts,
  removeAccount,
  rememberAccount,
  upsertAccount,
  type KnownAccount,
} from "./known-accounts";

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));
const acct = (email: string, n: number): KnownAccount => ({
  email,
  displayName: null,
  lastUsedAt: at(n).toISOString(),
});

describe("parseKnownAccounts", () => {
  it("returns [] for missing, corrupt or wrong-shaped data", () => {
    expect(parseKnownAccounts(null)).toEqual([]);
    expect(parseKnownAccounts("{nope")).toEqual([]);
    expect(parseKnownAccounts('{"a":1}')).toEqual([]);
    expect(parseKnownAccounts('[1,"x",{"email":5}]')).toEqual([]);
  });

  it("keeps valid entries, drops extra fields, sorts newest first", () => {
    const raw = JSON.stringify([{ ...acct("old@x.com", 1), token: "secret" }, acct("new@x.com", 2), null]);
    expect(parseKnownAccounts(raw)).toEqual([acct("new@x.com", 2), acct("old@x.com", 1)]);
  });
});

describe("upsertAccount", () => {
  it("adds a new account first", () => {
    const list = upsertAccount([acct("a@x.com", 1)], { email: "b@x.com", displayName: "B" }, at(2));
    expect(list.map((a) => a.email)).toEqual(["b@x.com", "a@x.com"]);
  });

  it("replaces an existing account case-insensitively and refreshes it", () => {
    const list = upsertAccount([acct("A@x.com", 1), acct("b@x.com", 2)], { email: "a@x.com", displayName: "A" }, at(3));
    expect(list).toEqual([{ email: "a@x.com", displayName: "A", lastUsedAt: at(3).toISOString() }, acct("b@x.com", 2)]);
  });

  it("keeps only the 5 most recent", () => {
    const full = [1, 2, 3, 4, 5].map((n) => acct(`u${n}@x.com`, n));
    const list = upsertAccount(full, { email: "new@x.com", displayName: null }, at(9));
    expect(list).toHaveLength(5);
    expect(list.map((a) => a.email)).not.toContain("u1@x.com");
  });
});

describe("removeAccount", () => {
  it("removes by email ignoring case", () => {
    expect(removeAccount([acct("A@x.com", 1), acct("b@x.com", 2)], "a@x.com")).toEqual([acct("b@x.com", 2)]);
  });
});

describe("storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns [] and does not throw when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(readKnownAccounts()).toEqual([]);
    expect(() => rememberAccount({ email: "a@x.com", displayName: null })).not.toThrow();
    expect(() => forgetAccount("a@x.com")).not.toThrow();
  });

  it("round-trips remember and forget", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    rememberAccount({ email: "a@x.com", displayName: "A" });
    expect(readKnownAccounts().map((a) => a.email)).toEqual(["a@x.com"]);
    forgetAccount("A@x.com");
    expect(readKnownAccounts()).toEqual([]);
  });
});
