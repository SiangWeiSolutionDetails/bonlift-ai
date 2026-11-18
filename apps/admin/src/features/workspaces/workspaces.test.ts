import { CONSOLE_ACTIONS, type AuthMeResponseSchemaType } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import {
  BRAND_PAGES,
  brandWorkspaceSource,
  buildWorkspaces,
  canOpen,
  CONSOLE_PAGES,
  defaultWorkspace,
  firstVisiblePage,
  legacyRedirect,
} from "./workspaces";

const BRAND_A = "00000000-0000-4000-8000-00000000000a";
const BRAND_B = "00000000-0000-4000-8000-00000000000b";
const BRAND_C = "00000000-0000-4000-8000-00000000000c";
const NO_ACCESS = { to: "/no-access", search: {} };

function brand(brandId: string, brandName: string, tenantName: string, actions: string[]) {
  return {
    brandId,
    brandName,
    tenantId: `tenant-${tenantName}`,
    tenantName,
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

const consoleRole = {
  roleId: "00000000-0000-4000-8000-000000000004",
  roleName: "Admin",
  isAdmin: true,
  actions: [...CONSOLE_ACTIONS],
};
const admin = me({ console: consoleRole });
const providerView = me({ console: { ...consoleRole, roleName: "Support", isAdmin: false, actions: ["provider.view"] } });
const staff = me({ console: { ...consoleRole, roleName: "Staff", isAdmin: false, actions: ["users.view"] } });

describe("buildWorkspaces", () => {
  const user = me({
    console: consoleRole,
    brands: [
      brand(BRAND_C, "Zeta", "Alpha Tenant", []),
      brand(BRAND_B, "Beta", "Zulu Tenant", []),
      brand(BRAND_A, "Alpha", "Alpha Tenant", []),
    ],
  });

  it("groups brands by tenant, sorted by name", () => {
    const { tenants } = buildWorkspaces(user);
    expect(tenants.map((t) => t.tenantName)).toEqual(["Alpha Tenant", "Zulu Tenant"]);
    expect(tenants[0].brands.map((b) => b.brandName)).toEqual(["Alpha", "Zeta"]);
    expect(tenants[0].brands[0]).toMatchObject({ kind: "brand", brandId: BRAND_A, roleName: "Role" });
  });

  it("counts console plus every brand", () => {
    expect(buildWorkspaces(user)).toMatchObject({ console: true, count: 4 });
  });

  it("gives an Admin without brand roles the console only", () => {
    expect(buildWorkspaces(admin)).toEqual({ console: true, tenants: [], count: 1 });
  });

  it("gives a brand-only user no console", () => {
    const brandOnly = me({ brands: [brand(BRAND_A, "Alpha", "T", [])] });
    expect(buildWorkspaces(brandOnly)).toMatchObject({ console: false, count: 1 });
  });
});

describe("canOpen", () => {
  const user = me({ brands: [brand(BRAND_A, "Alpha", "T", [])] });

  it("opens console only with a console role", () => {
    expect(canOpen(admin, "console")).toBe(true);
    expect(canOpen(user, "console")).toBe(false);
  });

  it("opens brands in me.brands without provider access", () => {
    expect(canOpen(user, BRAND_A)).toBe(true);
    expect(canOpen(user, BRAND_B)).toBe(false);
    expect(canOpen(staff, BRAND_A)).toBe(false);
  });

  it("opens any brand with provider access, including an Admin", () => {
    expect(canOpen(providerView, BRAND_B)).toBe(true);
    expect(canOpen(admin, BRAND_A)).toBe(true);
  });
});

describe("brandWorkspaceSource", () => {
  const user = me({ console: providerView.console, brands: [brand(BRAND_A, "Alpha", "T", [])] });

  it("prefers the brand role when the user holds one", () => {
    expect(brandWorkspaceSource(user, BRAND_A)).toBe("role");
  });

  it("falls to provider access on a brand without a role", () => {
    expect(brandWorkspaceSource(user, BRAND_B)).toBe("provider");
    expect(brandWorkspaceSource(admin, BRAND_A)).toBe("provider");
  });

  it("is null without a role or provider access", () => {
    expect(brandWorkspaceSource(staff, BRAND_A)).toBeNull();
    expect(brandWorkspaceSource(me({ brands: [brand(BRAND_A, "Alpha", "T", [])] }), BRAND_B)).toBeNull();
  });
});

describe("defaultWorkspace", () => {
  const both = me({
    console: consoleRole,
    brands: [brand(BRAND_B, "Beta", "Zulu", ["usage.view"]), brand(BRAND_A, "Alpha", "Alpha T", ["usage.view"])],
  });

  it("prefers a remembered workspace that can still be opened", () => {
    expect(defaultWorkspace(both, BRAND_B)).toBe(BRAND_B);
    expect(defaultWorkspace(both, "console")).toBe("console");
  });

  it("falls back to console when the remembered one is gone", () => {
    expect(defaultWorkspace(both, BRAND_C)).toBe("console");
    expect(defaultWorkspace(both, null)).toBe("console");
  });

  it("falls back to the first brand by tenant then brand name", () => {
    expect(defaultWorkspace(me({ brands: both.brands }), null)).toBe(BRAND_A);
  });

  it("skips a remembered brand with no page the role can see", () => {
    const user = me({ console: staff.console, brands: [brand(BRAND_A, "Alpha", "T", [])] });
    expect(defaultWorkspace(user, BRAND_A)).toBe("console");
  });

  it("skips a console role with no page and falls to a brand that has one", () => {
    const user = me({
      console: { ...consoleRole, isAdmin: false, actions: [] },
      brands: [brand(BRAND_A, "Alpha", "A", []), brand(BRAND_B, "Beta", "B", ["usage.view"])],
    });
    expect(defaultWorkspace(user, "console")).toBe(BRAND_B);
  });

  it("ignores a remembered brand opened only as provider", () => {
    expect(defaultWorkspace(providerView, BRAND_A)).toBe("console");
  });

  it("is null with nothing to open", () => {
    expect(defaultWorkspace(me(), "console")).toBeNull();
    expect(defaultWorkspace(me({ brands: [brand(BRAND_A, "Alpha", "T", [])] }), BRAND_A)).toBeNull();
  });
});

describe("firstVisiblePage", () => {
  it("returns the first console page the role allows", () => {
    const user = me({ console: { ...consoleRole, isAdmin: false, actions: ["users.view", "roles.view"] } });
    expect(firstVisiblePage(user, "console")).toBe("/console/users");
  });

  it("returns the first brand page in sidebar order", () => {
    const user = me({ brands: [brand(BRAND_A, "A", "T", ["usage.view", "snapshots.view"])] });
    expect(firstVisiblePage(user, BRAND_A)).toBe(`/b/${BRAND_A}/snapshots`);
  });

  it.each(["dataSource.view", "configs.view", "calculations.view", "channels.view"])(
    "shows Settings for %s",
    (action) => {
      const user = me({ brands: [brand(BRAND_A, "A", "T", [action])] });
      expect(firstVisiblePage(user, BRAND_A)).toBe(`/b/${BRAND_A}/settings`);
    },
  );

  it("shows Brands for provider access without brands.view", () => {
    expect(firstVisiblePage(providerView, "console")).toBe("/console/brands");
    expect(firstVisiblePage(staff, "console")).toBe("/console/users");
  });

  it("returns the first page provider access allows on any brand", () => {
    expect(firstVisiblePage(providerView, BRAND_A)).toBe(`/b/${BRAND_A}/outlets`);
    expect(firstVisiblePage(admin, BRAND_B)).toBe(`/b/${BRAND_B}/outlets`);
  });

  it("is null for a workspace the user cannot open or without pages", () => {
    expect(firstVisiblePage(staff, BRAND_A)).toBeNull();
    expect(firstVisiblePage(me({ brands: [brand(BRAND_A, "A", "T", [])] }), BRAND_A)).toBeNull();
    expect(firstVisiblePage(me(), "console")).toBeNull();
  });
});

describe("page tables", () => {
  it("lists pages in sidebar order", () => {
    expect(BRAND_PAGES.map((p) => p.segment)).toEqual([
      "outlets", "users", "roles", "settings", "snapshots", "calculations", "results",
      "customer-scores", "item-affinity", "api-keys", "usage", "feedback",
    ]);
    expect(CONSOLE_PAGES.map((p) => p.segment)).toEqual(["tenants", "brands", "users", "roles"]);
  });
});

describe("legacyRedirect", () => {
  const user = me({
    console: staff.console,
    brands: [
      brand(BRAND_A, "Alpha", "T", ["usage.view"]),
      brand(BRAND_B, "Beta", "T", ["usage.view", "apiKeys.view"]),
    ],
  });

  it.each(["tenants", "brands", "users", "roles"])("moves /%s under /console keeping search", (page) => {
    expect(legacyRedirect(user, `/${page}`, { q: "x" }, null)).toEqual({
      to: `/console/${page}`,
      search: { q: "x" },
    });
  });

  it.each([
    ["outlets", "outlets"],
    ["snapshots", "snapshots"],
    ["calculations", "calculations"],
    ["results", "results"],
    ["customer-scores", "customer-scores"],
    ["item-affinity", "item-affinity"],
    ["brand-api-keys", "api-keys"],
    ["usage", "usage"],
    ["recommendation-feedback", "feedback"],
  ])("moves /%s with brandId into the brand path", (legacy, segment) => {
    expect(legacyRedirect(user, `/${legacy}`, { brandId: BRAND_B, runId: "r1" }, null)).toEqual({
      to: `/b/${BRAND_B}/${segment}`,
      search: { runId: "r1" },
    });
  });

  it("uses the remembered brand when it holds the action", () => {
    expect(legacyRedirect(user, "/usage", { range: "7d" }, BRAND_B)).toEqual({
      to: `/b/${BRAND_B}/usage`,
      search: { range: "7d" },
    });
  });

  it("falls to the first brand with the action when the remembered one lacks it", () => {
    expect(legacyRedirect(user, "/brand-api-keys", {}, BRAND_A)).toEqual({
      to: `/b/${BRAND_B}/api-keys`,
      search: {},
    });
  });

  it("falls to the first brand with the action when nothing is remembered", () => {
    expect(legacyRedirect(user, "/usage", {}, "console")).toEqual({
      to: `/b/${BRAND_A}/usage`,
      search: {},
    });
  });

  it("falls to the first brand by tenant then brand name, not me.brands order", () => {
    const unsorted = me({
      brands: [
        brand(BRAND_C, "Gamma", "Zulu", ["usage.view"]),
        brand(BRAND_B, "Beta", "Alpha", ["usage.view"]),
        brand(BRAND_A, "Alpha", "Mike", ["usage.view"]),
      ],
    });
    expect(legacyRedirect(unsorted, "/usage", {}, null)).toEqual({ to: `/b/${BRAND_B}/usage`, search: {} });
  });

  it("sends a given brandId the user cannot open to no-access", () => {
    expect(legacyRedirect(user, "/usage", { brandId: BRAND_C, range: "7d" }, null)).toEqual(NO_ACCESS);
    expect(legacyRedirect(staff, "/outlets", { brandId: BRAND_A }, null)).toEqual(NO_ACCESS);
  });

  it("opens a given brandId through provider access", () => {
    expect(legacyRedirect(admin, "/outlets", { brandId: BRAND_A }, null)).toEqual({
      to: `/b/${BRAND_A}/outlets`,
      search: {},
    });
  });

  it("ignores a remembered brand opened only as provider", () => {
    expect(legacyRedirect(user, "/usage", {}, BRAND_C)).toEqual({ to: `/b/${BRAND_A}/usage`, search: {} });
    expect(legacyRedirect(admin, "/outlets", {}, BRAND_A)).toEqual(NO_ACCESS);
  });

  it("goes to no-access when no brand holds the action", () => {
    expect(legacyRedirect(user, "/results", {}, null)).toEqual(NO_ACCESS);
    expect(legacyRedirect(admin, "/outlets", {}, null)).toEqual(NO_ACCESS);
  });

  it("ignores paths that are not legacy", () => {
    expect(legacyRedirect(user, "/console/users", {}, null)).toBeNull();
    expect(legacyRedirect(user, "/no-access", {}, null)).toBeNull();
  });
});
