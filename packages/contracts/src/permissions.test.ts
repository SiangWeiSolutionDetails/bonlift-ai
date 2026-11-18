import { describe, expect, it } from "vitest";
import {
  BRAND_ACTIONS,
  CONSOLE_ACTIONS,
  PERMISSIONS,
  PERSONAL_DATA_ACTIONS,
  PROVIDER_GRANTS,
  PERMISSION_KEY_PATTERN,
  hasProviderAccess,
  isBrandAction,
  isConsoleAction,
  providerBrandActions,
} from "./permissions.js";

describe("permissions catalog", () => {
  const keys = PERMISSIONS.map((p) => p.key);

  it("has unique keys", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("matches the key pattern", () => {
    for (const key of keys) expect(key).toMatch(PERMISSION_KEY_PATTERN);
  });

  it("splits console and brand actions", () => {
    expect(CONSOLE_ACTIONS).toContain("tenants.create");
    expect(CONSOLE_ACTIONS).toContain("users.assignBrandRoles");
    expect(CONSOLE_ACTIONS).toContain("roles.manage");
    expect(CONSOLE_ACTIONS).not.toContain("apiKeys.view");
    expect(BRAND_ACTIONS).toContain("apiKeys.revoke");
    expect(BRAND_ACTIONS).toContain("snapshots.viewCustomerIds");
    expect(BRAND_ACTIONS).toContain("members.manage");
    expect(BRAND_ACTIONS).not.toContain("brands.view");
  });

  it("guards by kind", () => {
    expect(isConsoleAction("tenants.view")).toBe(true);
    expect(isConsoleAction("apiKeys.view")).toBe(false);
    expect(isBrandAction("nope.x")).toBe(false);
  });

  it("has the provider and brand-role actions", () => {
    expect(CONSOLE_ACTIONS).toContain("provider.view");
    expect(CONSOLE_ACTIONS).toContain("provider.support");
    expect(BRAND_ACTIONS).toContain("brandRoles.view");
    expect(BRAND_ACTIONS).toContain("brandRoles.manage");
    expect(CONSOLE_ACTIONS).toHaveLength(19);
    expect(BRAND_ACTIONS).toHaveLength(30);
  });
});

describe("provider grants", () => {
  const view = PROVIDER_GRANTS["provider.view"];
  const support = PROVIDER_GRANTS["provider.support"];

  it("never grants personal data", () => {
    for (const grant of [view, support])
      for (const action of PERSONAL_DATA_ACTIONS) expect(grant).not.toContain(action);
  });

  it("never grants members.manage", () => {
    expect(support).not.toContain("members.manage");
  });

  it("makes support a superset of view", () => {
    for (const action of view) expect(support).toContain(action);
    expect(support.length).toBeGreaterThan(view.length);
  });

  it("unions grants by console action", () => {
    expect(providerBrandActions([])).toEqual([]);
    expect(providerBrandActions(["tenants.view"])).toEqual([]);
    expect(providerBrandActions(["provider.view"])).toEqual([...view]);
    expect(new Set(providerBrandActions(["provider.support"]))).toEqual(new Set(support));
    expect(new Set(providerBrandActions(["provider.view", "provider.support"]))).toEqual(
      new Set(support),
    );
  });

  it("has provider access with either provider action", () => {
    expect(hasProviderAccess([])).toBe(false);
    expect(hasProviderAccess(["brands.view", "users.view"])).toBe(false);
    expect(hasProviderAccess(["provider.view"])).toBe(true);
    expect(hasProviderAccess(["provider.support"])).toBe(true);
  });
});
