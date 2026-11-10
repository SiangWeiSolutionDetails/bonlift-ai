import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

const ADMIN_TOKEN = "a".repeat(64);
const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
// Everything outside these prefixes is admin surface and must demand the admin token.
const PUBLIC_PREFIXES = ["/health", "/docs", "/v1/"];

type RouteEntry = { method: string; url: string };

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
  vi.stubEnv("ADMIN_TOKEN", ADMIN_TOKEN);
  vi.stubEnv("CUSTOMER_ID_SECRET", "b".repeat(64));
  // Dev routes on, so the inventory covers every route the app can register.
  vi.stubEnv("ENABLE_DEV_ROUTES", "true");
  app = buildApp();
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) routes.push({ method, url: route.url });
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

describe("admin route inventory", () => {
  it("finds admin routes to check", () => {
    expect(adminRoutes().length).toBeGreaterThan(0);
  });

  it("rejects every admin route without the admin token", async () => {
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
  });

  it("lets a valid admin token through to validation", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/tenants/not-a-uuid",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("takes the customer search id in the body, so it never appears in the logged URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/runs/not-a-uuid/customer-item-scores/customers/search",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { customerId: "log-probe@mail.com" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain("log-probe");
  });

  it("keeps /health public", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("does not accept the admin token on /v1", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/recommendations",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});
