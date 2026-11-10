import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey, hashApiKey } from "../services/brandApiKey.service.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { ValidationError } from "../errors.js";
import { createServingChannelHook, createServingKeyAuthenticator } from "./servingAuth.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const API_KEY_ID = "22222222-2222-2222-2222-222222222222";
const CHANNEL_ID = "33333333-3333-3333-3333-333333333333";
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
    channel_id: null,
    channel_code: null,
    channel_is_active: null,
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
      channel: null,
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

describe("createServingKeyAuthenticator with a channel", () => {
  it("returns the key's channel with its code and state", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([keyRow({ channel_id: CHANNEL_ID, channel_code: "tqr", channel_is_active: false })]),
    );

    expect((await authenticator()(KEY))?.channel).toStrictEqual({
      id: CHANNEL_ID,
      code: "tqr",
      isActive: false,
    });
  });
});

describe("createServingChannelHook", () => {
  const hook = createServingChannelHook();
  const TQR = { id: CHANNEL_ID, code: "tqr", isActive: true };

  function request(servingChannel: unknown, body: unknown) {
    return { servingChannel, body } as any;
  }

  it.each([
    ["the body sends the key's channel", TQR, { channel: "tqr" }],
    ["the body sends no channel", TQR, {}],
    ["there is no body", TQR, undefined],
    ["the key has no channel, whatever the body sends", null, { channel: "anything" }],
  ])("accepts the call when %s", async (_name, channel, body) => {
    await expect(hook(request(channel, body))).resolves.toBeUndefined();
  });

  it("rejects a channel that differs from the key's", async () => {
    await expect(hook(request(TQR, { channel: "pos" }))).rejects.toThrow(ValidationError);
  });

  it("rejects a non-string channel", async () => {
    await expect(hook(request(TQR, { channel: 1 }))).rejects.toThrow(ValidationError);
  });

  it("rejects every call of a key whose channel is switched off", async () => {
    await expect(hook(request({ ...TQR, isActive: false }, {}))).rejects.toThrow(ValidationError);
  });
});
