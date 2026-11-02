import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import {
  createItemAffinityCalculationConfigVersion,
  getItemAffinityCalculationConfigVersions,
  getLatestItemAffinityCalculationConfigVersion,
} from "./itemAffinityCalculationConfigVersion.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const VERSION_ID = "22222222-2222-2222-2222-222222222222";
const CREATED_AT = new Date("2026-11-02T00:00:00.000Z");

const VERSION_ROW = {
  id: VERSION_ID,
  brand_id: BRAND_ID,
  version: 2,
  created_by: "api",
  created_at: CREATED_AT,
  top_n: 10,
  min_pair_orders: 10,
  max_order_items: 20,
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

beforeEach(() => {
  queryMock.mockReset();
});

describe("getLatestItemAffinityCalculationConfigVersion", () => {
  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      getLatestItemAffinityCalculationConfigVersion(fakePool, BRAND_ID),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws a plain Error when the brand has no version", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ ...VERSION_ROW, id: null }]));

    await expect(
      getLatestItemAffinityCalculationConfigVersion(fakePool, BRAND_ID),
    ).rejects.not.toThrow(NotFoundError);
  });

  it("maps the row with its three settings", async () => {
    queryMock.mockResolvedValueOnce(pgResult([VERSION_ROW]));

    const result = await getLatestItemAffinityCalculationConfigVersion(
      fakePool,
      BRAND_ID,
    );

    expect(result).toStrictEqual({
      id: VERSION_ID,
      brandId: BRAND_ID,
      jobType: "item_affinity",
      version: 2,
      createdBy: "api",
      createdAt: CREATED_AT.toISOString(),
      topN: 10,
      minPairOrders: 10,
      maxOrderItems: 20,
    });
  });
});

describe("getItemAffinityCalculationConfigVersions", () => {
  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      getItemAffinityCalculationConfigVersions(fakePool, BRAND_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("createItemAffinityCalculationConfigVersion", () => {
  it("throws ConflictError when another version was created at the same time", async () => {
    queryMock.mockRejectedValueOnce({
      code: UNIQUE_VIOLATION,
      constraint: "calculation_config_versions_brand_job_type_version_key",
    });

    await expect(
      createItemAffinityCalculationConfigVersion(
        fakePool,
        BRAND_ID,
        { topN: 5 },
        "api",
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("sends only the changed settings and leaves the rest to the latest version", async () => {
    queryMock.mockResolvedValueOnce(pgResult([VERSION_ROW]));

    await createItemAffinityCalculationConfigVersion(
      fakePool,
      BRAND_ID,
      { minPairOrders: 30 },
      "api",
    );

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("item_affinity_calculation_config_versions"),
      [BRAND_ID, "api", null, 30, null],
    );
  });
});
