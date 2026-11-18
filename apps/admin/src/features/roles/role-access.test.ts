import {
  BRAND_ACTIONS,
  CONSOLE_ACTIONS,
  PERSONAL_DATA_ACTIONS,
  type AuthMeResponseSchemaType,
} from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { grantLimit, holdsBrandAction, isWithinLimit } from "./role-access";
import { brandScope, CONSOLE_SCOPE } from "./type";

const BRAND_A = "00000000-0000-4000-8000-00000000000a";
const BRAND_B = "00000000-0000-4000-8000-00000000000b";

function brand(brandId: string, actions: string[]) {
  return {
    brandId,
    brandName: "Brand",
    tenantId: "00000000-0000-4000-8000-000000000001",
    tenantName: "Tenant",
    roleId: "00000000-0000-4000-8000-000000000002",
    roleName: "Role",
    actions,
  };
}

function consoleRole(actions: string[], isAdmin = false) {
  return { roleId: "00000000-0000-4000-8000-000000000004", roleName: "Role", isAdmin, actions };
}

function me(overrides: Partial<AuthMeResponseSchemaType> = {}): AuthMeResponseSchemaType {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    email: "user@example.com",
    displayName: null,
    console: null,
    brands: [],
    nameLocked: false,
    needsNameConfirmation: false,
    ...overrides,
  };
}

const sorted = (set: ReadonlySet<string>) => [...set].sort();

describe("grantLimit for brand roles", () => {
  it("is the actor's own brand-role actions on that brand", () => {
    const user = me({
      brands: [
        brand(BRAND_A, ["brandRoles.manage", "outlets.view", "customerScores.view"]),
        brand(BRAND_B, ["apiKeys.view"]),
      ],
    });
    expect(sorted(grantLimit(user, brandScope(BRAND_A)))).toEqual(
      ["brandRoles.manage", "customerScores.view", "outlets.view"],
    );
  });

  it("gives provider support every brand action except personal data", () => {
    const limit = grantLimit(me({ console: consoleRole(["provider.support"]) }), brandScope(BRAND_A));
    expect(limit.has("brandUsers.manage")).toBe(true);
    expect(sorted(limit)).toEqual(
      BRAND_ACTIONS.filter((action) => !PERSONAL_DATA_ACTIONS.includes(action)).sort(),
    );
  });

  it("adds personal-data actions only when held through a brand role on that brand", () => {
    const user = me({
      console: consoleRole([...CONSOLE_ACTIONS], true),
      brands: [brand(BRAND_A, ["customerScores.view"])],
    });
    expect(grantLimit(user, brandScope(BRAND_A)).has("customerScores.view")).toBe(true);
    expect(grantLimit(user, brandScope(BRAND_A)).has("snapshots.viewCustomerIds")).toBe(false);
    expect(grantLimit(user, brandScope(BRAND_B)).has("customerScores.view")).toBe(false);
  });

  it("grants nothing through provider view alone", () => {
    const limit = grantLimit(me({ console: consoleRole(["provider.view"]) }), brandScope(BRAND_A));
    expect(limit.size).toBe(0);
  });
});

describe("grantLimit for console roles", () => {
  it("is the actor's console actions", () => {
    const user = me({ console: consoleRole(["roles.manage", "users.view"]) });
    expect(sorted(grantLimit(user, CONSOLE_SCOPE))).toEqual(["roles.manage", "users.view"]);
  });

  it("is empty without a console role", () => {
    expect(grantLimit(me(), CONSOLE_SCOPE).size).toBe(0);
  });
});

describe("holdsBrandAction", () => {
  it("passes through a brand role on that brand only", () => {
    const user = me({ brands: [brand(BRAND_A, ["brandUsers.view"])] });
    expect(holdsBrandAction(user, BRAND_A, "brandUsers.view")).toBe(true);
    expect(holdsBrandAction(user, BRAND_B, "brandUsers.view")).toBe(false);
  });

  it("passes through provider grants on any brand, never for personal data", () => {
    const user = me({ console: consoleRole(["provider.view"]) });
    expect(holdsBrandAction(user, BRAND_B, "brandRoles.view")).toBe(true);
    expect(holdsBrandAction(user, BRAND_B, "brandRoles.manage")).toBe(false);
    const admin = me({ console: consoleRole([...CONSOLE_ACTIONS], true) });
    expect(holdsBrandAction(admin, BRAND_B, "customerScores.view")).toBe(false);
  });
});

describe("isWithinLimit", () => {
  it("is true only when every action is in the limit", () => {
    const limit = new Set(["a", "b"]);
    expect(isWithinLimit(["a"], limit)).toBe(true);
    expect(isWithinLimit([], limit)).toBe(true);
    expect(isWithinLimit(["a", "c"], limit)).toBe(false);
  });
});
