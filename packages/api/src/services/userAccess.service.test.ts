import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pgResult } from "../utils/pg.test-helpers.js";
import { createSessionToken } from "./session.service.js";
import { findSessionUserAccess, mapUserAccess, type UserAccessRow } from "./userAccess.service.js";

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
      console: null,
      brands: [],
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
