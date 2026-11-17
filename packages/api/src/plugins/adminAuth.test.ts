import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../errors.js";
import { createSessionToken } from "../services/session.service.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { createAdminSessionHook } from "./adminAuth.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const { token: TOKEN } = createSessionToken();

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;
const hook = createAdminSessionHook(() => fakePool);

function requestWith(cookies: Record<string, string>) {
  return { cookies, user: null } as any;
}

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
