import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pgResult } from "../utils/pg.test-helpers.js";
import { authorizeRequest, decide, type AuthorizationRow, type RouteAccess } from "./authorization.service.js";
import { createSessionToken, SESSION_IDLE_MS, SESSION_TOUCH_MS } from "./session.service.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BRAND_ID = "22222222-2222-2222-2222-222222222222";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

beforeEach(() => {
  queryMock.mockReset();
});

function row(overrides: Partial<AuthorizationRow> = {}): AuthorizationRow {
  return {
    id: USER_ID,
    email: "alice@x.com",
    display_name: "Alice",
    console_is_builtin: null,
    console_actions: null,
    has_brand_role: false,
    brand_actions: null,
    ...overrides,
  };
}

const consoleRole = (actions: string[]) => row({ console_is_builtin: false, console_actions: actions });
const adminRole = () => row({ console_is_builtin: true, console_actions: [] });
const brandRole = (actions: string[]) => row({ has_brand_role: true, brand_actions: actions });

describe("decide", () => {
  it("allows any session for signedIn", () => {
    expect(decide(row(), "signedIn")).toBe("allow");
  });

  it("allows a console action the console role holds", () => {
    expect(decide(consoleRole(["tenants.view"]), { console: "tenants.view" })).toBe("allow");
  });

  it("forbids a missing console action", () => {
    expect(decide(consoleRole(["tenants.view"]), { console: "tenants.create" })).toBe("forbidden");
    expect(decide(row(), { console: "tenants.view" })).toBe("forbidden");
  });

  it("gives an Admin every console action", () => {
    expect(decide(adminRole(), { console: "roles.manage" })).toBe("allow");
  });

  it("returns notFound for a brand action without a brand role, even for an Admin", () => {
    const access = { brand: "apiKeys.view", from: "params.brandId" } as const;

    expect(decide(row(), access)).toBe("notFound");
    expect(decide(adminRole(), access)).toBe("notFound");
  });

  it("forbids a brand action the brand role lacks", () => {
    expect(decide(brandRole(["apiKeys.view"]), { brand: "apiKeys.revoke", from: "params.brandId" })).toBe(
      "forbidden",
    );
  });

  it("allows a brand action the brand role holds", () => {
    expect(decide(brandRole(["apiKeys.revoke"]), { brand: "apiKeys.revoke", from: "params.brandId" })).toBe(
      "allow",
    );
  });

  it("allows brandMember for any brand role", () => {
    expect(decide(brandRole([]), { brandMember: "params.brandId" })).toBe("allow");
    expect(decide(row(), { brandMember: "params.brandId" })).toBe("notFound");
  });

  it("allows anyOf when one branch allows", () => {
    const access: RouteAccess = {
      anyOf: [{ console: "brands.view" }, { brandMember: "params.brandId" }],
    };

    expect(decide(consoleRole(["brands.view"]), access)).toBe("allow");
    expect(decide(brandRole([]), access)).toBe("allow");
  });

  it("returns forbidden over notFound from anyOf only when the user holds a role on the brand", () => {
    const access: RouteAccess = {
      anyOf: [{ console: "brands.edit" }, { brand: "outlets.edit", from: "params.brandId" }],
    };

    expect(decide(brandRole(["outlets.view"]), access)).toBe("forbidden");
    expect(decide(consoleRole(["tenants.view"]), access)).toBe("notFound");
  });

  it("forbids an anyOf of console checks only when none passes", () => {
    expect(decide(row(), { anyOf: [{ console: "brands.edit" }, { console: "brands.view" }] })).toBe("forbidden");
  });

  it("ignores catalog-unknown actions", () => {
    expect(decide(consoleRole(["gone.action"]), { console: "tenants.view" })).toBe("forbidden");
    expect(decide(brandRole(["gone.action"]), { brand: "apiKeys.view", from: "params.brandId" })).toBe(
      "forbidden",
    );
  });
});

describe("authorizeRequest", () => {
  it("returns null without querying for a malformed token", async () => {
    expect(await authorizeRequest(fakePool, "not-a-token", "signedIn", {})).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns null when no session matches", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    expect(await authorizeRequest(fakePool, createSessionToken().token, "signedIn", {})).toBeNull();
  });

  it("gives an Admin every console action", async () => {
    queryMock.mockResolvedValueOnce(pgResult([adminRole()]));

    const result = await authorizeRequest(fakePool, createSessionToken().token, { console: "roles.manage" }, {});

    expect(result).toEqual({
      access: {
        user: { id: USER_ID, email: "alice@x.com", displayName: "Alice" },
        isAdmin: true,
        consoleActions: [...CONSOLE_ACTIONS],
      },
      brandActions: null,
      decision: "allow",
    });
  });

  it("drops actions not in the catalog", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        row({
          console_is_builtin: false,
          console_actions: ["tenants.view", "gone.action"],
          has_brand_role: true,
          brand_actions: ["apiKeys.view", "gone.action"],
        }),
      ]),
    );

    const result = await authorizeRequest(
      fakePool,
      createSessionToken().token,
      { brand: "apiKeys.view", from: "params.brandId" },
      { "params.brandId": BRAND_ID },
    );

    expect(result?.access.consoleActions).toEqual(["tenants.view"]);
    expect(result?.access.isAdmin).toBe(false);
    expect(result?.brandActions).toEqual(["apiKeys.view"]);
  });

  it("returns null brand actions without a brand role", async () => {
    queryMock.mockResolvedValueOnce(pgResult([row()]));

    const result = await authorizeRequest(
      fakePool,
      createSessionToken().token,
      { brand: "apiKeys.view", from: "params.brandId" },
      { "params.brandId": BRAND_ID },
    );

    expect(result?.brandActions).toBeNull();
    expect(result?.decision).toBe("notFound");
  });

  it("binds the session parameters and skips brand resolution without a brand check", async () => {
    queryMock.mockResolvedValueOnce(pgResult([row()]));
    const { token, idHash } = createSessionToken();

    await authorizeRequest(fakePool, token, { console: "tenants.view" }, {});

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("touched AS");
    expect(sql).toContain("console_role AS");
    expect(sql).not.toContain("target AS");
    expect(sql).not.toContain("brand_role AS");
    expect(params).toEqual([idHash, SESSION_IDLE_MS, SESSION_TOUCH_MS]);
  });

  it.each([
    ["params.brandId", "FROM brands b"],
    ["body.brandId", "FROM brands b"],
    ["params.outletId", "FROM outlets o"],
    ["params.runId", "FROM computation_runs r"],
  ] as const)("resolves the brand from %s", async (from, source) => {
    queryMock.mockResolvedValueOnce(pgResult([row()]));
    const ref = "33333333-3333-3333-3333-333333333333";

    await authorizeRequest(fakePool, createSessionToken().token, { brand: "outlets.view", from }, { [from]: ref });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("target AS");
    expect(sql).toContain(source);
    expect(sql).toContain("deleted_at IS NULL");
    expect(params[3]).toBe(ref);
  });

  it("binds a null ref when the declared ref is missing", async () => {
    queryMock.mockResolvedValueOnce(pgResult([row()]));

    const result = await authorizeRequest(
      fakePool,
      createSessionToken().token,
      { brandMember: "params.outletId" },
      {},
    );

    expect(queryMock.mock.calls[0][1][3]).toBeNull();
    expect(result?.decision).toBe("notFound");
  });

  it("throws when anyOf declares more than one brand ref", async () => {
    await expect(
      authorizeRequest(
        fakePool,
        createSessionToken().token,
        { anyOf: [{ brandMember: "params.brandId" }, { brand: "outlets.view", from: "params.outletId" }] },
        {},
      ),
    ).rejects.toThrow(/brand ref/);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
