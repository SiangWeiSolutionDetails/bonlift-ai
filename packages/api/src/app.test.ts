import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { resetAuthConfigCache } from "./config/env.js";
import { PERSONAL_DATA_ACTIONS } from "@bonlift-ai/contracts";
import {
  authorizeRequest,
  checksOf,
  decide,
  type AuthorizationRow,
  type RouteAccess,
} from "./services/authorization.service.js";

vi.mock("./services/authorization.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/authorization.service.js")>()),
  authorizeRequest: vi.fn(),
}));
vi.mock("@bonlift-ai/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bonlift-ai/db")>()),
  getPool: () => ({ query: vi.fn() }),
}));

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const SESSION_COOKIE = { sid: "a".repeat(43) };
const SESSION_USER = { id: PLACEHOLDER_ID, email: "alice@x.com", displayName: null };
// Everything outside these prefixes is admin surface and must demand a session.
const PUBLIC_PREFIXES = ["/health", "/docs", "/auth/", "/v1/"];

type RouteEntry = { method: string; url: string; access: unknown };

let app: FastifyInstance;
const routes: RouteEntry[] = [];

function isPublic(url: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix));
}

function toRequestUrl(url: string): string {
  return url.replace(/:[A-Za-z]+/g, PLACEHOLDER_ID).replace(/\*$/, "x");
}

function adminRoutes(): RouteEntry[] {
  return routes.filter((r) => r.method !== "OPTIONS" && !isPublic(r.url));
}

beforeAll(async () => {
  vi.stubEnv("CUSTOMER_ID_SECRET", "b".repeat(64));
  vi.stubEnv("APP_BASE_URL", "http://localhost:5173");
  vi.stubEnv("SESSION_COOKIE_SECRET", "c".repeat(64));
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("MICROSOFT_CLIENT_ID", "test-microsoft-client-id");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-microsoft-client-secret");
  resetAuthConfigCache();
  // Dev routes on, so the inventory covers every route the app can register.
  vi.stubEnv("ENABLE_DEV_ROUTES", "true");
  app = buildApp();
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) routes.push({ method, url: route.url, access: route.config?.access });
  });
  await app.ready();
});

beforeEach(() => {
  vi.mocked(authorizeRequest).mockReset();
});

function signIn() {
  vi.mocked(authorizeRequest).mockResolvedValue({
    access: { user: SESSION_USER, isAdmin: false, consoleActions: [] },
    brandActions: null,
    decision: "allow",
  });
}

afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
  resetAuthConfigCache();
});

describe("admin route inventory", () => {
  it("finds admin routes to check", () => {
    expect(adminRoutes().length).toBeGreaterThan(0);
  });

  it("rejects every admin route without a session cookie", async () => {
    const unguarded: string[] = [];
    for (const route of adminRoutes()) {
      const res = await app.inject({
        method: route.method as any,
        url: toRequestUrl(route.url),
        payload: ["GET", "HEAD", "DELETE"].includes(route.method) ? undefined : {},
      });
      if (res.statusCode !== 401) unguarded.push(`${route.method} ${route.url} -> ${res.statusCode}`);
    }
    expect(unguarded).toEqual([]);
    expect(authorizeRequest).not.toHaveBeenCalled();
  });

  it("declares access on every admin route", () => {
    const undeclared = adminRoutes()
      .filter((route) => route.access === undefined)
      .map((route) => `${route.method} ${route.url}`);
    expect(undeclared).toEqual([]);
  });

  it.each([
    ["provider.view", { console_is_builtin: false, console_actions: ["provider.view"] }],
    ["provider.support", { console_is_builtin: false, console_actions: ["provider.support"] }],
    ["Admin", { console_is_builtin: true, console_actions: [] }],
  ])("never allows %s onto a personal-data route without a brand role", (_, consoleRole) => {
    const providerRow: AuthorizationRow = {
      id: PLACEHOLDER_ID,
      email: "alice@x.com",
      display_name: null,
      ...consoleRole,
      brand_exists: true,
      has_brand_role: false,
      brand_actions: null,
    };
    const personalRoutes = adminRoutes().filter((route) =>
      checksOf(route.access as RouteAccess).some(
        (check) => "brand" in check && PERSONAL_DATA_ACTIONS.includes(check.brand),
      ),
    );

    const allowed = personalRoutes
      .filter((route) => decide(providerRow, route.access as RouteAccess) === "allow")
      .map((route) => `${route.method} ${route.url}`);

    expect(personalRoutes.map((route) => route.url)).toEqual(
      expect.arrayContaining(["/runs/:runId/customer-item-scores", "/outlets/:outletId/order-snapshots/:date"]),
    );
    expect(allowed).toEqual([]);
  });

  it("lists a brand's roles for console users.assignBrandRoles without a brand role, but not its writes", () => {
    const assigner: AuthorizationRow = {
      id: PLACEHOLDER_ID,
      email: "alice@x.com",
      display_name: null,
      console_is_builtin: false,
      console_actions: ["users.assignBrandRoles"],
      brand_exists: true,
      has_brand_role: false,
      brand_actions: null,
    };
    const accessOf = (method: string, url: string) =>
      adminRoutes().find((route) => route.method === method && route.url === url)!.access as RouteAccess;

    expect(decide(assigner, accessOf("GET", "/brands/:brandId/roles"))).toBe("allow");
    expect(decide({ ...assigner, console_actions: [] }, accessOf("GET", "/brands/:brandId/roles"))).toBe("notFound");
    expect(
      decide(
        { ...assigner, console_actions: [], has_brand_role: true, brand_actions: ["brandRoles.view"] },
        accessOf("GET", "/brands/:brandId/roles"),
      ),
    ).toBe("allow");
    expect(decide(assigner, accessOf("POST", "/brands/:brandId/roles"))).toBe("notFound");
    expect(decide(assigner, accessOf("GET", "/brands/:brandId/roles/:roleId/assignments"))).toBe("notFound");
  });

  it("lets a valid session through to validation", async () => {
    signIn();
    const res = await app.inject({
      method: "DELETE",
      url: "/tenants/not-a-uuid",
      cookies: SESSION_COOKIE,
    });
    expect(res.statusCode).toBe(400);
  });

  it("takes the customer search id in the body, so it never appears in the logged URL", async () => {
    signIn();
    const res = await app.inject({
      method: "POST",
      url: "/runs/not-a-uuid/customer-item-scores/customers/search",
      cookies: SESSION_COOKIE,
      payload: { customerId: "log-probe@mail.com" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain("log-probe");
  });

  it("keeps /health public", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("does not accept a session cookie on /v1", async () => {
    signIn();
    const res = await app.inject({
      method: "POST",
      url: "/v1/recommendations",
      cookies: SESSION_COOKIE,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});
