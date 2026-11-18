import {
  CONSOLE_ACTIONS,
  PERSONAL_DATA_ACTIONS,
  type AuthMeResponseSchemaType,
  type BrandAction,
} from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { canBrand, canConsole, hasAccess, holdsBrandRole, isProvider, type RouteAccess } from "./permissions";

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

function consoleUser(actions: string[], brands: ReturnType<typeof brand>[] = []) {
  return me({ console: { ...admin.console!, roleName: "Staff", isAdmin: false, actions }, brands });
}

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
  it("gives provider.view read access on any brand without a brand role", () => {
    const user = consoleUser(["provider.view"]);
    expect(canBrand(user, BRAND_A, "outlets.view")).toBe(true);
    expect(canBrand(user, BRAND_B, "results.view")).toBe(true);
    expect(canBrand(user, BRAND_A, "outlets.edit")).toBe(false);
  });

  it("gives provider.support edit access on any brand", () => {
    const user = consoleUser(["provider.support"]);
    expect(canBrand(user, BRAND_A, "outlets.view")).toBe(true);
    expect(canBrand(user, BRAND_A, "outlets.edit")).toBe(true);
    expect(canBrand(user, BRAND_A, "brandRoles.manage")).toBe(true);
  });

  it("gives an Admin provider access without a brand role", () => {
    expect(canBrand(admin, BRAND_A, "outlets.view")).toBe(true);
    expect(canBrand(admin, BRAND_A, "outlets.edit")).toBe(true);
  });

  it.each(PERSONAL_DATA_ACTIONS)("never grants %s through provider access", (action) => {
    expect(canBrand(admin, BRAND_A, action)).toBe(false);
    expect(canBrand(consoleUser(["provider.support"]), BRAND_A, action)).toBe(false);
  });

  it("grants personal data through a brand role held alongside provider access", () => {
    const user = consoleUser(["provider.support"], [brand(BRAND_A, ["customerScores.view"])]);
    expect(canBrand(user, BRAND_A, "customerScores.view")).toBe(true);
    expect(canBrand(user, BRAND_B, "customerScores.view")).toBe(false);
  });

  it("grants nothing through console actions that are not provider access", () => {
    expect(canBrand(consoleUser(["brands.view", "users.view"]), BRAND_A, "outlets.view")).toBe(false);
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

  it("gives an Admin brand pages through provider access, except personal data", () => {
    expect(hasAccess(admin, { brand: "outlets.view" }, BRAND_A)).toBe(true);
    expect(hasAccess(admin, { brand: "customerScores.view" }, BRAND_A)).toBe(false);
  });

  it("passes a console page with any one of its actions", () => {
    const access: RouteAccess = { console: ["brands.view", "provider.view"] };
    expect(hasAccess(consoleUser(["provider.view"]), access)).toBe(true);
    expect(hasAccess(consoleUser(["users.view"]), access)).toBe(false);
  });
});

describe("holdsBrandRole", () => {
  it("is true only for brands in me.brands", () => {
    const user = me({ console: admin.console, brands: [brand(BRAND_A, [])] });
    expect(holdsBrandRole(user, BRAND_A)).toBe(true);
    expect(holdsBrandRole(user, BRAND_B)).toBe(false);
  });
});

describe("isProvider", () => {
  it("is true with provider.view, provider.support or Admin", () => {
    expect(isProvider(consoleUser(["provider.view"]))).toBe(true);
    expect(isProvider(consoleUser(["provider.support"]))).toBe(true);
    expect(isProvider(admin)).toBe(true);
  });

  it("is false without provider access", () => {
    expect(isProvider(consoleUser(["brands.view"]))).toBe(false);
    expect(isProvider(me())).toBe(false);
  });
});
