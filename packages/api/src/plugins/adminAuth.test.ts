import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthConfigCache } from "../config/env.js";
import { ForbiddenError, UnauthorizedError } from "../errors.js";
import { createSessionToken } from "../services/session.service.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { createAdminSessionHook } from "./adminAuth.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const { token: TOKEN } = createSessionToken();

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;
const hook = createAdminSessionHook(() => fakePool);
const APP_BASE_URL = "http://localhost:5173";
const SESSION_ROW = { id: USER_ID, email: "alice@x.com", display_name: "Alice" };

function requestWith(
  cookies: Record<string, string>,
  { method = "GET", headers = {} }: { method?: string; headers?: Record<string, string> } = {},
) {
  return { cookies, method, headers, user: null } as any;
}

beforeAll(() => {
  vi.stubEnv("APP_BASE_URL", APP_BASE_URL);
  vi.stubEnv("SESSION_COOKIE_SECRET", "c".repeat(64));
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  resetAuthConfigCache();
});

afterAll(() => {
  vi.unstubAllEnvs();
  resetAuthConfigCache();
});

beforeEach(() => {
  queryMock.mockReset();
});

describe("createAdminSessionHook", () => {
  it("throws UnauthorizedError without querying when there is no session cookie", async () => {
    await expect(hook(requestWith({}))).rejects.toBeInstanceOf(UnauthorizedError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedError when the cookie matches no live session", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(hook(requestWith({ sid: TOKEN }))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("sets request.user from a valid session", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ id: USER_ID, email: "alice@x.com", display_name: "Alice" }]),
    );
    const request = requestWith({ sid: TOKEN });

    await hook(request);

    expect(request.user).toStrictEqual({ id: USER_ID, email: "alice@x.com", displayName: "Alice" });
  });
});

describe("createAdminSessionHook — cross-site writes", () => {
  it("refuses a cross-site Sec-Fetch-Site POST before looking up the session", async () => {
    const request = requestWith({ sid: TOKEN }, { method: "POST", headers: { "sec-fetch-site": "same-site" } });

    await expect(hook(request)).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses a POST from a foreign Origin before looking up the session", async () => {
    const request = requestWith(
      { sid: TOKEN },
      { method: "POST", headers: { origin: "https://evil.bonlift.example" } },
    );

    await expect(hook(request)).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("accepts a same-origin POST whose Origin matches APP_BASE_URL", async () => {
    queryMock.mockResolvedValueOnce(pgResult([SESSION_ROW]));
    const request = requestWith(
      { sid: TOKEN },
      { method: "POST", headers: { origin: APP_BASE_URL, "sec-fetch-site": "same-origin" } },
    );

    await hook(request);

    expect(request.user?.id).toBe(USER_ID);
  });

  it("does not apply the origin check to GET", async () => {
    queryMock.mockResolvedValueOnce(pgResult([SESSION_ROW]));
    const request = requestWith(
      { sid: TOKEN },
      { method: "GET", headers: { origin: "https://evil.bonlift.example", "sec-fetch-site": "cross-site" } },
    );

    await hook(request);

    expect(request.user?.id).toBe(USER_ID);
  });

  it("accepts a POST with neither header (scripts)", async () => {
    queryMock.mockResolvedValueOnce(pgResult([SESSION_ROW]));
    const request = requestWith({ sid: TOKEN }, { method: "POST" });

    await hook(request);

    expect(request.user?.id).toBe(USER_ID);
  });
});
