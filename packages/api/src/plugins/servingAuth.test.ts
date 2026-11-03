import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey, hashApiKey } from "../services/brandApiKey.service.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { createServingKeyAuthenticator } from "./servingAuth.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const API_KEY_ID = "22222222-2222-2222-2222-222222222222";
const { key: KEY, keyPrefix: KEY_PREFIX } = generateApiKey();
const TTL_MS = 60_000;

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;
let clock = 0;

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: API_KEY_ID,
    brand_id: BRAND_ID,
    name: "pos-boat-quay",
    key_hash: hashApiKey(KEY),
    expires_at: null,
    ...overrides,
  };
}

function authenticator() {
  return createServingKeyAuthenticator({
    getPool: () => fakePool,
    ttlMs: TTL_MS,
    now: () => clock,
  });
}

beforeEach(() => {
  queryMock.mockReset();
  clock = 1_000_000;
});

describe("createServingKeyAuthenticator", () => {
  it("returns the key id, brand and name of a live key", async () => {
    queryMock.mockResolvedValueOnce(pgResult([keyRow()]));

    expect(await authenticator()(KEY)).toStrictEqual({
      apiKeyId: API_KEY_ID,
      brandId: BRAND_ID,
      name: "pos-boat-quay",
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("revoked_at IS NULL"),
      [KEY_PREFIX],
    );
  });

  it("returns null when no live key has the prefix (unknown, revoked or expired in the database)", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    expect(await authenticator()(KEY)).toBeNull();
  });

  it("returns null for the right prefix with a wrong secret", async () => {
    queryMock.mockResolvedValueOnce(pgResult([keyRow()]));
    const wrongSecret = `${KEY_PREFIX}.${"A".repeat(43)}`;

    expect(await authenticator()(wrongSecret)).toBeNull();
  });

  it.each([
    ["no key", undefined],
    ["an empty key", ""],
    ["a key without a prefix", "A".repeat(43)],
    ["an old caller:key value", `tqr:${"t".repeat(32)}`],
  ])("returns null for %s without querying", async (_name, presented) => {
    expect(await authenticator()(presented)).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("serves a repeated key from the cache within the TTL", async () => {
    queryMock.mockResolvedValueOnce(pgResult([keyRow()]));
    const authenticate = authenticator();

    await authenticate(KEY);
    queryMock.mockClear();
    clock += TTL_MS - 1;

    expect(await authenticate(KEY)).not.toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("checks the database again once the TTL has passed, so a revoked key stops working", async () => {
    queryMock
      .mockResolvedValueOnce(pgResult([keyRow()]))
      .mockResolvedValueOnce(pgResult([]));
    const authenticate = authenticator();

    await authenticate(KEY);
    clock += TTL_MS;

    expect(await authenticate(KEY)).toBeNull();
  });

  it("rejects a cached key as soon as it expires", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([keyRow({ expires_at: new Date(clock + 10) })]),
    );
    const authenticate = authenticator();

    expect(await authenticate(KEY)).not.toBeNull();
    clock += 10;

    expect(await authenticate(KEY)).toBeNull();
  });

  it("does not cache a wrong secret as a match for the right one", async () => {
    queryMock.mockResolvedValueOnce(pgResult([keyRow()]));
    const authenticate = authenticator();

    await authenticate(KEY);

    expect(await authenticate(`${KEY_PREFIX}.${"A".repeat(43)}`)).toBeNull();
  });

  it("lets a database error through, so the hook can answer 503", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));

    await expect(authenticator()(KEY)).rejects.toThrow("connection refused");
  });
});
