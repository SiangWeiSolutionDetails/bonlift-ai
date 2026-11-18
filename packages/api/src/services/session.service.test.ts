import { beforeEach, describe, expect, it, vi } from "vitest";
import { pgResult } from "../utils/pg.test-helpers.js";
import {
  createSession,
  createSessionToken,
  deleteSession,
  findSessionUser,
  hashSessionToken,
  SESSION_IDLE_MS,
  SESSION_TOUCH_MS,
} from "./session.service.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

beforeEach(() => {
  queryMock.mockReset();
});

describe("createSessionToken", () => {
  it("returns a 43-char base64url token and its SHA-256", () => {
    const { token, idHash } = createSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(idHash).toEqual(hashSessionToken(token));
  });
});

describe("hashSessionToken", () => {
  it.each([
    ["empty", ""],
    ["short", "abc"],
    ["non-base64url char", "+".padEnd(43, "a")],
    ["44 chars", "a".repeat(44)],
  ])("returns null for a %s token", (_label, token) => {
    expect(hashSessionToken(token)).toBeNull();
  });

  it("returns a 32-byte hash for a well-formed token", () => {
    expect(hashSessionToken("a".repeat(43))?.length).toBe(32);
  });
});

describe("createSession", () => {
  it("stores the 32-byte hash, never the token itself", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    const token = await createSession(fakePool, USER_ID, "microsoft", "Mozilla/5.0");

    const params = queryMock.mock.calls[0][1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params).not.toContain(token);
    const hash = params.find((p: unknown) => Buffer.isBuffer(p));
    expect(hash).toHaveLength(32);
    expect(hash).toEqual(hashSessionToken(token));
    expect(params).toContain(USER_ID);
    expect(params).toContain("microsoft");
    expect(params).toContain("Mozilla/5.0");
  });

  it("truncates the user agent to 512 characters", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await createSession(fakePool, USER_ID, "google", "x".repeat(2000));

    expect(queryMock.mock.calls[0][1]).toContain("x".repeat(512));
  });

  it("stores a null user agent as null", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await createSession(fakePool, USER_ID, "google", null);

    expect(queryMock.mock.calls[0][1][4]).toBeNull();
  });
});

describe("findSessionUser", () => {
  it("returns null for a malformed token without querying", async () => {
    const user = await findSessionUser(fakePool, "not-a-token");

    expect(user).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("maps the row to a SessionUser", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ id: USER_ID, email: "alice@x.com", display_name: "Alice" }]),
    );

    const user = await findSessionUser(fakePool, createSessionToken().token);

    expect(user).toEqual({ id: USER_ID, email: "alice@x.com", displayName: "Alice" });
  });

  it("returns null when no session matches", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    expect(await findSessionUser(fakePool, createSessionToken().token)).toBeNull();
  });

  it("checks status, absolute expiry and idle timeout with bound intervals", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));
    const { token, idHash } = createSessionToken();

    await findSessionUser(fakePool, token);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("expires_at > now()");
    expect(sql).toMatch(/last_seen_at > now\(\) - make_interval\(secs => \$\d+/);
    expect(sql).not.toContain(String(SESSION_IDLE_MS));
    expect(sql).not.toContain(String(SESSION_TOUCH_MS));
    expect(params).toEqual([idHash, SESSION_IDLE_MS, SESSION_TOUCH_MS]);
  });
});

describe("deleteSession", () => {
  it("deletes by hash", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));
    const { token, idHash } = createSessionToken();

    await deleteSession(fakePool, token);

    expect(queryMock.mock.calls[0][0]).toContain("DELETE FROM user_sessions");
    expect(queryMock.mock.calls[0][1]).toEqual([idHash]);
  });

  it("skips the query for a malformed token", async () => {
    await deleteSession(fakePool, "bad");

    expect(queryMock).not.toHaveBeenCalled();
  });
});
