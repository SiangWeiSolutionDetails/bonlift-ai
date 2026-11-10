import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { getBrandUsage, recordServingUsage } from "./brandUsage.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const API_KEY_ID = "22222222-2222-2222-2222-222222222222";
const QUERY = { from: "2026-11-01", to: "2026-11-02", tz: "Asia/Singapore" };

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function usageRow() {
  return {
    days: [
      { date: "2026-11-01", succeeded: 3, clientErrors: 1, serverErrors: 0, calculationRuns: 2 },
      { date: "2026-11-02", succeeded: 0, clientErrors: 0, serverErrors: 0, calculationRuns: 0 },
    ],
    api_keys: [
      { apiKeyId: API_KEY_ID, name: "pos", keyPrefix: "a1b2c3d4", succeeded: 3, clientErrors: 1, serverErrors: 0 },
    ],
    channels: [
      { channelId: null, code: null, name: null, succeeded: 3, clientErrors: 1, serverErrors: 0 },
    ],
    calculations: [{ jobType: "item_affinity", status: "succeeded", runs: 2 }],
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("getBrandUsage", () => {
  describe("validation (never reaches the database)", () => {
    it("throws ValidationError for an invalid brand id", async () => {
      await expect(getBrandUsage(fakePool, "invalid-id", QUERY)).rejects.toThrow(ValidationError);
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError for an unknown time zone", async () => {
      await expect(
        getBrandUsage(fakePool, BRAND_ID, { ...QUERY, tz: "Mars/Olympus" }),
      ).rejects.toThrow("Mars/Olympus is not a valid time zone.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when from is after to", async () => {
      await expect(
        getBrandUsage(fakePool, BRAND_ID, { ...QUERY, from: "2026-11-03" }),
      ).rejects.toThrow("from must not be after to.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("accepts a single day (from equal to to)", async () => {
      queryMock.mockResolvedValueOnce(pgResult([usageRow()]));

      await expect(
        getBrandUsage(fakePool, BRAND_ID, { ...QUERY, to: QUERY.from }),
      ).resolves.toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
    });
  });

  it("passes the brand, inclusive dates and time zone to the query", async () => {
    queryMock.mockResolvedValueOnce(pgResult([usageRow()]));

    await getBrandUsage(fakePool, BRAND_ID, QUERY);

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      BRAND_ID,
      "2026-11-01",
      "2026-11-02",
      "Asia/Singapore",
    ]);
  });

  it("scopes every count to the brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult([usageRow()]));

    await getBrandUsage(fakePool, BRAND_ID, QUERY);

    const sql: string = queryMock.mock.calls[0][0];
    expect(sql).toContain("e.brand_id = bounds.brand_id");
    expect(sql).toContain("r.brand_id = bounds.brand_id");
  });

  it("returns the days, keys, channels and calculations with the query echoed", async () => {
    queryMock.mockResolvedValueOnce(pgResult([usageRow()]));

    expect(await getBrandUsage(fakePool, BRAND_ID, QUERY)).toStrictEqual({
      brandId: BRAND_ID,
      ...QUERY,
      days: usageRow().days,
      apiKeys: usageRow().api_keys,
      channels: usageRow().channels,
      calculations: usageRow().calculations,
    });
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getBrandUsage(fakePool, BRAND_ID, QUERY)).rejects.toThrow(NotFoundError);
  });
});

describe("recordServingUsage", () => {
  it("inserts one row for the call", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await recordServingUsage(fakePool, {
      brandId: BRAND_ID,
      apiKeyId: API_KEY_ID,
      channelId: null,
      route: "/v1/recommendations",
      statusCode: 200,
      durationMs: 12,
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO serving_usage_events"),
      [BRAND_ID, API_KEY_ID, null, "/v1/recommendations", 200, 12],
    );
  });
});
