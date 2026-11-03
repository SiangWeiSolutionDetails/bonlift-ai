import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import {
  createBrandApiKey,
  deleteBrandApiKey,
  generateApiKey,
  hashApiKey,
  listBrandApiKeys,
  parseApiKeyPrefix,
  revokeBrandApiKey,
  revokeBrandApiKeyById,
} from "./brandApiKey.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const KEY_ID = "22222222-2222-2222-2222-222222222222";
const INPUT = { brandId: BRAND_ID, name: "pos-boat-quay", createdBy: "cli:test" };

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

const CREATED_AT = new Date("2026-11-02T04:00:00Z");

function createdRow(overrides: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    brand_id: BRAND_ID,
    name: "pos-boat-quay",
    key_prefix: "0a1b2c3d",
    status: "live",
    created_by: "cli:test",
    created_at: CREATED_AT,
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

const RECORD = {
  id: KEY_ID,
  brandId: BRAND_ID,
  name: "pos-boat-quay",
  keyPrefix: "0a1b2c3d",
  status: "live",
  createdBy: "cli:test",
  createdAt: "2026-11-02T04:00:00.000Z",
  expiresAt: null,
  revokedAt: null,
};

beforeEach(() => {
  queryMock.mockReset();
});

describe("generateApiKey", () => {
  it("returns a prefix.secret key that parses back to its prefix", () => {
    const { key, keyPrefix } = generateApiKey();

    expect(key).toMatch(/^[0-9a-f]{8}\.[A-Za-z0-9_-]{43}$/);
    expect(parseApiKeyPrefix(key)).toBe(keyPrefix);
  });

  it("never returns the same key twice", () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});

describe("parseApiKeyPrefix", () => {
  it.each([
    ["no key", undefined],
    ["a key without a dot", "0a1b2c3d" + "A".repeat(43)],
    ["an uppercase prefix", `0A1B2C3D.${"A".repeat(43)}`],
    ["a short secret", `0a1b2c3d.${"A".repeat(42)}`],
    ["trailing text", `0a1b2c3d.${"A".repeat(43)} `],
  ])("returns null for %s", (_name, presented) => {
    expect(parseApiKeyPrefix(presented)).toBeNull();
  });
});

describe("createBrandApiKey", () => {
  it("stores only the hash of the key and returns the key once", async () => {
    queryMock.mockResolvedValueOnce(pgResult([createdRow()]));

    const created = await createBrandApiKey(fakePool, INPUT);

    const [, values] = queryMock.mock.calls[0];
    expect(values).toStrictEqual([
      BRAND_ID,
      "pos-boat-quay",
      parseApiKeyPrefix(created.key),
      hashApiKey(created.key),
      "cli:test",
      null,
    ]);
    expect(values).not.toContain(created.key);
    expect(created).toStrictEqual({ ...RECORD, key: created.key });
  });

  it("passes the expiry in days", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([createdRow({ expires_at: new Date("2027-01-01T00:00:00Z") })]),
    );

    const created = await createBrandApiKey(fakePool, { ...INPUT, expiresInDays: 30 });

    expect(queryMock.mock.calls[0][1][5]).toBe(30);
    expect(created.expiresAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(createBrandApiKey(fakePool, INPUT)).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when the brand already has a live key with the name", async () => {
    queryMock.mockRejectedValueOnce({
      code: UNIQUE_VIOLATION,
      constraint: "brand_api_keys_brand_name_key",
    });

    await expect(createBrandApiKey(fakePool, INPUT)).rejects.toThrow(ConflictError);
  });

  it.each([
    ["the brand id is not a uuid", { ...INPUT, brandId: "brand-1" }],
    ["the name is blank", { ...INPUT, name: " " }],
    ["the expiry is not a whole number of days", { ...INPUT, expiresInDays: 1.5 }],
  ])("throws ValidationError without querying when %s", async (_name, input) => {
    await expect(createBrandApiKey(fakePool, input)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("listBrandApiKeys", () => {
  it("maps every key of the brand to a record without the hash", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        createdRow(),
        createdRow({ id: "33333333-3333-3333-3333-333333333333", status: "revoked", revoked_at: CREATED_AT }),
      ]),
    );

    const { apiKeys } = await listBrandApiKeys(fakePool, BRAND_ID);

    expect(apiKeys).toStrictEqual([
      RECORD,
      {
        ...RECORD,
        id: "33333333-3333-3333-3333-333333333333",
        status: "revoked",
        revokedAt: "2026-11-02T04:00:00.000Z",
      },
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.not.stringContaining("key_hash"), [BRAND_ID]);
  });

  it("returns no keys for a brand without any (one row with a NULL key)", async () => {
    queryMock.mockResolvedValueOnce(pgResult([createdRow({ id: null })]));

    expect(await listBrandApiKeys(fakePool, BRAND_ID)).toStrictEqual({ apiKeys: [] });
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(listBrandApiKeys(fakePool, BRAND_ID)).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError without querying for an invalid brand id", async () => {
    await expect(listBrandApiKeys(fakePool, "brand-1")).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("revokeBrandApiKeyById", () => {
  it("revokes the brand's live key and returns its record", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([createdRow({ status: "revoked", revoked_at: CREATED_AT })]),
    );

    expect(await revokeBrandApiKeyById(fakePool, BRAND_ID, KEY_ID)).toStrictEqual({
      ...RECORD,
      status: "revoked",
      revokedAt: "2026-11-02T04:00:00.000Z",
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("AND brand_id = $1"),
      [BRAND_ID, KEY_ID],
    );
  });

  it("throws NotFoundError when the brand has no live key with the id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(revokeBrandApiKeyById(fakePool, BRAND_ID, KEY_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ValidationError without querying for an invalid key id", async () => {
    await expect(revokeBrandApiKeyById(fakePool, BRAND_ID, "key-1")).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("deleteBrandApiKey", () => {
  it("deletes a revoked or expired key of the brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ deletable: true }]));

    await expect(deleteBrandApiKey(fakePool, BRAND_ID, KEY_ID)).resolves.toBeUndefined();
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM brand_api_keys"),
      [BRAND_ID, KEY_ID],
    );
  });

  it("only deletes keys that can no longer authenticate", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ deletable: true }]));

    await deleteBrandApiKey(fakePool, BRAND_ID, KEY_ID);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("k.revoked_at IS NOT NULL OR k.expires_at <= now()"),
      expect.any(Array),
    );
  });

  it("throws ConflictError for a live key", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ deletable: false }]));

    await expect(deleteBrandApiKey(fakePool, BRAND_ID, KEY_ID)).rejects.toThrow(
      ConflictError,
    );
  });

  it("throws NotFoundError when the brand has no key with the id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(deleteBrandApiKey(fakePool, BRAND_ID, KEY_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ValidationError without querying for an invalid key id", async () => {
    await expect(deleteBrandApiKey(fakePool, BRAND_ID, "key-1")).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("revokeBrandApiKey", () => {
  it("revokes the live key with the prefix", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ brand_id: BRAND_ID, name: "pos-boat-quay" }]),
    );

    expect(await revokeBrandApiKey(fakePool, "0a1b2c3d")).toStrictEqual({
      brandId: BRAND_ID,
      name: "pos-boat-quay",
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("revoked_at IS NULL"),
      ["0a1b2c3d"],
    );
  });

  it("throws NotFoundError when no live key has the prefix", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(revokeBrandApiKey(fakePool, "0a1b2c3d")).rejects.toThrow(NotFoundError);
  });
});
