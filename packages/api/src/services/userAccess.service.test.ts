import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { createSessionToken, hashSessionToken, SESSION_IDLE_MS, SESSION_TOUCH_MS } from "./session.service.js";
import { findSessionUserAccess, mapUserAccess, updateOwnName, type UserAccessRow } from "./userAccess.service.js";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

beforeEach(() => {
  queryMock.mockReset();
});

function row(overrides: Partial<UserAccessRow> = {}): UserAccessRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "alice@x.com",
    display_name: "Alice",
    display_name_source: "self",
    console: null,
    brands: [],
    ...overrides,
  };
}

const brand = (actions: string[]) => ({
  brandId: "b1",
  brandName: "Brand",
  tenantId: "t1",
  tenantName: "Tenant",
  roleId: "r1",
  roleName: "Viewer",
  actions,
});

describe("mapUserAccess", () => {
  it("lists every console action for an Admin", () => {
    const result = mapUserAccess(
      row({ console: { roleId: "r0", roleName: "Admin", isBuiltin: true, actions: [] } }),
    );

    expect(result.console).toEqual({
      roleId: "r0",
      roleName: "Admin",
      isAdmin: true,
      actions: [...CONSOLE_ACTIONS],
    });
  });

  it("returns no console role and no brands for a user without roles", () => {
    const result = mapUserAccess(row());

    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "alice@x.com",
      displayName: "Alice",
      nameLocked: false,
      needsNameConfirmation: false,
      console: null,
      brands: [],
    });
  });

  it.each([
    ["staff", true, false],
    ["provider", false, true],
    ["self", false, false],
    [null, false, true],
  ] as const)("maps a %s name to nameLocked %s and needsNameConfirmation %s", (source, locked, confirm) => {
    expect(mapUserAccess(row({ display_name_source: source }))).toMatchObject({
      nameLocked: locked,
      needsNameConfirmation: confirm,
    });
  });

  it("drops actions that are no longer in the catalog", () => {
    const result = mapUserAccess(
      row({
        console: { roleId: "r2", roleName: "Ops", isBuiltin: false, actions: ["tenants.view", "gone.console"] },
        brands: [brand(["apiKeys.view", "gone.brand"])],
      }),
    );

    expect(result.console).toMatchObject({ isAdmin: false, actions: ["tenants.view"] });
    expect(result.brands[0].actions).toEqual(["apiKeys.view"]);
  });

  it("keeps a brand role without permissions", () => {
    expect(mapUserAccess(row({ brands: [brand([])] })).brands[0].actions).toEqual([]);
  });
});

describe("findSessionUserAccess", () => {
  it("returns null without querying for a malformed token", async () => {
    expect(await findSessionUserAccess(fakePool, "nope")).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns null when the session is not live", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    expect(await findSessionUserAccess(fakePool, createSessionToken().token)).toBeNull();
  });

  it("maps the single row", async () => {
    queryMock.mockResolvedValueOnce(pgResult([row()]));

    const result = await findSessionUserAccess(fakePool, createSessionToken().token);

    expect(result).toMatchObject({ email: "alice@x.com", console: null, brands: [] });
  });
});

describe("updateOwnName", () => {
  const token = createSessionToken().token;
  const renamed = (overrides: Record<string, unknown> = {}) => ({
    session_valid: true,
    name_locked: false,
    ...row({ display_name: "Alice Tan" }),
    ...overrides,
  });

  it("trims the name, sets it in one statement and returns the /auth/me shape", async () => {
    queryMock.mockResolvedValueOnce(pgResult([renamed()]));

    const result = await updateOwnName(fakePool, token, { displayName: "  Alice Tan  " });

    expect(result).toMatchObject({ displayName: "Alice Tan", nameLocked: false, needsNameConfirmation: false });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/display_name_source = 'self'/);
    expect(sql).toMatch(/display_name_source IS DISTINCT FROM 'staff'/);
    expect(params).toEqual([hashSessionToken(token), SESSION_IDLE_MS, SESSION_TOUCH_MS, "Alice Tan"]);
  });

  it("refuses a name that is empty after trimming without querying", async () => {
    await expect(updateOwnName(fakePool, token, { displayName: "   " })).rejects.toBeInstanceOf(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("accepts 200 characters and refuses 201 after trimming", async () => {
    queryMock.mockResolvedValueOnce(pgResult([renamed()]));

    await updateOwnName(fakePool, token, { displayName: ` ${"x".repeat(200)} ` });
    await expect(updateOwnName(fakePool, token, { displayName: "x".repeat(201) })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(queryMock.mock.calls.map(([, params]) => params[3])).toEqual(["x".repeat(200)]);
  });

  it("refuses a malformed token without querying", async () => {
    await expect(updateOwnName(fakePool, "nope", { displayName: "Alice" })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses when the session is not live", async () => {
    queryMock.mockResolvedValueOnce(pgResult([renamed({ session_valid: false, id: null })]));

    await expect(updateOwnName(fakePool, token, { displayName: "Alice" })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("refuses with 403 when staff set the name", async () => {
    queryMock.mockResolvedValueOnce(pgResult([renamed({ name_locked: true, id: null })]));

    await expect(updateOwnName(fakePool, token, { displayName: "Alice" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
