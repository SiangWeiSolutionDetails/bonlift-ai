import { describe, expect, it } from "vitest";
import {
  BRAND_ACTIONS,
  CONSOLE_ACTIONS,
  PERMISSIONS,
  PERMISSION_KEY_PATTERN,
  isBrandAction,
  isConsoleAction,
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
});
