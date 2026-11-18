import { CONSOLE_ACTIONS, type AuthMeResponseSchemaType, type BrandAction } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { brandsWith, canBrand, canConsole, hasAccess } from "./permissions";

const BRAND_A = "00000000-0000-4000-8000-00000000000a";
const BRAND_B = "00000000-0000-4000-8000-00000000000b";

function brand(brandId: string, actions: string[]) {
  return {
    brandId,
    brandName: `Brand ${brandId.at(-1)}`,
    tenantId: "00000000-0000-4000-8000-000000000001",
    tenantName: "Tenant",
    roleId: "00000000-0000-4000-8000-000000000002",
    roleName: "Role",
    actions,
  };
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

const admin = me({
  console: {
    roleId: "00000000-0000-4000-8000-000000000004",
    roleName: "Admin",
    isAdmin: true,
    actions: [...CONSOLE_ACTIONS],
  },
});

describe("canConsole", () => {
  it("lets an Admin do every console action", () => {
    expect(CONSOLE_ACTIONS.every((action) => canConsole(admin, action))).toBe(true);
  });

  it("is false without a console role", () => {
    expect(canConsole(me(), "tenants.view")).toBe(false);
  });

  it("is false for an action the console role lacks", () => {
    const user = me({ console: { ...admin.console!, isAdmin: false, actions: ["brands.view"] } });
    expect(canConsole(user, "brands.view")).toBe(true);
    expect(canConsole(user, "tenants.view")).toBe(false);
  });
});

describe("canBrand", () => {
  it("gives an Admin with no brand role nothing inside a brand", () => {
    expect(canBrand(admin, BRAND_A, "outlets.view")).toBe(false);
  });

  it("follows the role held on that brand", () => {
    const user = me({ brands: [brand(BRAND_A, ["outlets.view"]), brand(BRAND_B, ["usage.view"])] });
    expect(canBrand(user, BRAND_A, "outlets.view")).toBe(true);
    expect(canBrand(user, BRAND_A, "usage.view")).toBe(false);
    expect(canBrand(user, BRAND_B, "usage.view")).toBe(true);
  });

  it("ignores action strings that are not in the catalog", () => {
    const user = me({ brands: [brand(BRAND_A, ["stale.action"])] });
    expect(canBrand(user, BRAND_A, "stale.action" as BrandAction)).toBe(false);
  });
});

describe("brandsWith", () => {
  it("lists only the brands whose role holds the action", () => {
    const user = me({
      brands: [brand(BRAND_A, ["results.view", "usage.view"]), brand(BRAND_B, ["usage.view"])],
    });
    expect(brandsWith(user, "results.view").map((b) => b.brandId)).toEqual([BRAND_A]);
    expect(brandsWith(user, "usage.view").map((b) => b.brandId)).toEqual([BRAND_A, BRAND_B]);
    expect(brandsWith(user, "apiKeys.view")).toEqual([]);
  });

  it("lists nothing for an Admin with no brand role", () => {
    expect(brandsWith(admin, "outlets.view")).toEqual([]);
  });
});

describe("hasAccess", () => {
  it("checks a console action", () => {
    expect(hasAccess(admin, { console: "tenants.view" })).toBe(true);
    expect(hasAccess(me(), { console: "tenants.view" })).toBe(false);
  });

  it("checks a brand action on that brand only", () => {
    const user = me({ brands: [brand(BRAND_A, ["usage.view"]), brand(BRAND_B, ["results.view"])] });
    expect(hasAccess(user, { brand: "usage.view" }, BRAND_A)).toBe(true);
    expect(hasAccess(user, { brand: "usage.view" }, BRAND_B)).toBe(false);
    expect(hasAccess(user, { brand: "results.view" }, BRAND_A)).toBe(false);
  });

  it("passes a brand page with any one of its actions", () => {
    const user = me({ brands: [brand(BRAND_A, ["channels.view"])] });
    expect(hasAccess(user, { brand: ["configs.view", "channels.view"] }, BRAND_A)).toBe(true);
    expect(hasAccess(user, { brand: ["configs.view", "dataSource.view"] }, BRAND_A)).toBe(false);
  });

  it("denies a brand action without a brand", () => {
    const user = me({ brands: [brand(BRAND_A, ["usage.view"])] });
    expect(hasAccess(user, { brand: "usage.view" })).toBe(false);
  });

  it("gives an Admin no brand page access", () => {
    expect(hasAccess(admin, { brand: "outlets.view" }, BRAND_A)).toBe(false);
  });
});
