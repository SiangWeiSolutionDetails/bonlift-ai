import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthConfigCache } from "../config/env.js";
import { AppError } from "../errors.js";
import { authorizeRequest, type Authorization, type RouteAccess } from "../services/authorization.service.js";
import { createSessionToken } from "../services/session.service.js";
import { registerAdminAccess } from "./adminAccess.js";

vi.mock("../services/authorization.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/authorization.service.js")>()),
  authorizeRequest: vi.fn(),
}));

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OUTLET_ID = "22222222-2222-2222-2222-222222222222";
const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const APP_BASE_URL = "http://localhost:5173";
const { token: TOKEN } = createSessionToken();
const fakePool = { query: vi.fn() } as any;

const OUTLET_ACCESS: RouteAccess = { brand: "outlets.edit", from: "params.outletId" };

function authorization(decision: Authorization["decision"]): Authorization {
  return {
    access: { user: { id: USER_ID, email: "alice@x.com", displayName: "Alice" }, isAdmin: false, consoleActions: [] },
    brandActions: ["outlets.edit"],
    decision,
  };
}

async function buildStubApp(routes: (admin: FastifyInstance) => void): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler((error: any, _request, reply) => {
    const status = error instanceof AppError ? error.statusCode : error.validation ? 400 : 500;
    reply.status(status).send({ message: error.message });
  });
  app.register(fastifyCookie);
  app.register(async (admin) => {
    registerAdminAccess(admin, () => fakePool);
    routes(admin);
  });
  await app.ready();
  return app;
}

function stubRoutes(admin: FastifyInstance) {
  admin.post(
    "/outlets/:outletId",
    { config: { access: OUTLET_ACCESS } },
    (request) => ({ userId: request.access?.user.id, brandActions: request.brandActions }),
  );
  admin.get("/me", { config: { access: "signedIn" } }, (request) => ({ userId: request.access?.user.id }));
}

let app: FastifyInstance;

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", APP_BASE_URL);
  vi.stubEnv("SESSION_COOKIE_SECRET", "c".repeat(64));
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  resetAuthConfigCache();
  app = await buildStubApp(stubRoutes);
});

afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
  resetAuthConfigCache();
});

beforeEach(() => {
  vi.mocked(authorizeRequest).mockReset();
});

function allow() {
  vi.mocked(authorizeRequest).mockResolvedValue(authorization("allow"));
}

describe("registerAdminAccess at startup", () => {
  it("refuses to register a route without access", async () => {
    await expect(buildStubApp((admin) => admin.get("/open", () => ({})))).rejects.toThrow(
      "GET /open has no access declaration",
    );
  });

  it("refuses a console action declared as a brand check", async () => {
    const access = { brand: "tenants.view", from: "params.brandId" } as any;
    await expect(
      buildStubApp((admin) => admin.get("/brands/:brandId", { config: { access } }, () => ({}))),
    ).rejects.toThrow("tenants.view");
  });

  it("refuses a brand action declared as a console check", async () => {
    const access = { console: "outlets.view" } as any;
    await expect(buildStubApp((admin) => admin.get("/x", { config: { access } }, () => ({})))).rejects.toThrow(
      "outlets.view",
    );
  });

  it("refuses an anyOf that uses more than one brand ref", async () => {
    const access: RouteAccess = {
      anyOf: [
        { brand: "outlets.view", from: "params.outletId" },
        { brandUser: "params.brandId" },
      ],
    };
    await expect(
      buildStubApp((admin) => admin.get("/x/:outletId/:brandId", { config: { access } }, () => ({}))),
    ).rejects.toThrow("more than one brand ref");
  });
});

describe("registerAdminAccess on a request", () => {
  it.each<{ label: string; cookies: Record<string, string> }>([
    { label: "missing", cookies: {} },
    { label: "malformed", cookies: { sid: "not-a-token" } },
  ])("answers 401 without querying when the cookie is $label", async ({ cookies }) => {
    const res = await app.inject({ method: "GET", url: "/me", cookies });

    expect(res.statusCode).toBe(401);
    expect(authorizeRequest).not.toHaveBeenCalled();
  });

  it("answers 401 when the session is not live", async () => {
    vi.mocked(authorizeRequest).mockResolvedValue(null);

    const res = await app.inject({ method: "GET", url: "/me", cookies: { sid: TOKEN } });

    expect(res.statusCode).toBe(401);
  });

  it.each([
    { decision: "forbidden" as const, status: 403 },
    { decision: "notFound" as const, status: 404 },
  ])("maps $decision to $status", async ({ decision, status }) => {
    vi.mocked(authorizeRequest).mockResolvedValue(authorization(decision));

    const res = await app.inject({ method: "POST", url: `/outlets/${OUTLET_ID}`, cookies: { sid: TOKEN }, payload: {} });

    expect(res.statusCode).toBe(status);
  });

  it("passes params.outletId and body.brandId as refs", async () => {
    allow();

    await app.inject({
      method: "POST",
      url: `/outlets/${OUTLET_ID}`,
      cookies: { sid: TOKEN },
      payload: { brandId: BRAND_ID },
    });

    expect(authorizeRequest).toHaveBeenCalledWith(fakePool, TOKEN, OUTLET_ACCESS, {
      "params.outletId": OUTLET_ID,
      "body.brandId": BRAND_ID,
    });
  });

  it("sets request.access and request.brandActions when allowed", async () => {
    allow();

    const res = await app.inject({ method: "POST", url: `/outlets/${OUTLET_ID}`, cookies: { sid: TOKEN }, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toStrictEqual({ userId: USER_ID, brandActions: ["outlets.edit"] });
  });
});

describe("registerAdminAccess cross-site writes", () => {
  function post(headers: Record<string, string>) {
    return app.inject({ method: "POST", url: `/outlets/${OUTLET_ID}`, cookies: { sid: TOKEN }, headers, payload: {} });
  }

  it("refuses a cross-site Sec-Fetch-Site POST before looking up the session", async () => {
    const res = await post({ "sec-fetch-site": "same-site" });

    expect(res.statusCode).toBe(403);
    expect(authorizeRequest).not.toHaveBeenCalled();
  });

  it("refuses a POST from a foreign Origin before looking up the session", async () => {
    const res = await post({ origin: "https://evil.bonlift.example" });

    expect(res.statusCode).toBe(403);
    expect(authorizeRequest).not.toHaveBeenCalled();
  });

  it("accepts a same-origin POST whose Origin matches APP_BASE_URL", async () => {
    allow();

    const res = await post({ origin: APP_BASE_URL, "sec-fetch-site": "same-origin" });

    expect(res.statusCode).toBe(200);
  });

  it("does not apply the origin check to GET", async () => {
    allow();

    const res = await app.inject({
      method: "GET",
      url: "/me",
      cookies: { sid: TOKEN },
      headers: { origin: "https://evil.bonlift.example", "sec-fetch-site": "cross-site" },
    });

    expect(res.statusCode).toBe(200);
  });

  it("accepts a POST with neither header (scripts)", async () => {
    allow();

    const res = await post({});

    expect(res.statusCode).toBe(200);
  });
});
