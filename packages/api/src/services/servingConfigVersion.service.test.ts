import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { CHECK_VIOLATION, UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import {
  createServingConfigVersion,
  getLatestServingConfigVersion,
  getServingConfigVersions,
} from "./servingConfigVersion.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const VERSION_ID = "22222222-2222-2222-2222-222222222222";
const CREATED_AT = new Date("2026-11-02T00:00:00.000Z");

const VERSION_ROW = {
  id: VERSION_ID,
  brand_id: BRAND_ID,
  version: 2,
  created_by: "api",
  created_at: CREATED_AT,
  min_favourite_orders: 2,
  best_seller_max_rank: 3,
  best_seller_min_list_size: 10,
  rejection_suppression_days: 30,
  repeat_cooldown_hours: 24,
  feedback_window_minutes: 120,
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

beforeEach(() => {
  queryMock.mockReset();
});

describe("getLatestServingConfigVersion", () => {
  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      getLatestServingConfigVersion(fakePool, BRAND_ID),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws a plain Error when the brand has no version", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ ...VERSION_ROW, id: null }]));

    await expect(
      getLatestServingConfigVersion(fakePool, BRAND_ID),
    ).rejects.not.toThrow(NotFoundError);
  });

  it("maps the row with its eight settings", async () => {
    queryMock.mockResolvedValueOnce(pgResult([VERSION_ROW]));

    const result = await getLatestServingConfigVersion(fakePool, BRAND_ID);

    expect(result).toStrictEqual({
      id: VERSION_ID,
      brandId: BRAND_ID,
      version: 2,
      createdBy: "api",
      createdAt: CREATED_AT.toISOString(),
      minFavouriteOrders: 2,
      bestSellerMaxRank: 3,
      bestSellerMinListSize: 10,
      rejectionSuppressionDays: 30,
      repeatCooldownHours: 24,
      feedbackWindowMinutes: 120,
    });
  });
});

describe("getServingConfigVersions", () => {
  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getServingConfigVersions(fakePool, BRAND_ID)).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("createServingConfigVersion", () => {
  it("throws ConflictError when another version was created at the same time", async () => {
    queryMock.mockRejectedValueOnce({
      code: UNIQUE_VIOLATION,
      constraint: "serving_config_versions_brand_version_key",
    });

    await expect(
      createServingConfigVersion(
        fakePool,
        BRAND_ID,
        { bestSellerMaxRank: 5 },
        "api",
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("sends only the changed settings and leaves the rest to the latest version", async () => {
    queryMock.mockResolvedValueOnce(pgResult([VERSION_ROW]));

    await createServingConfigVersion(
      fakePool,
      BRAND_ID,
      { bestSellerMaxRank: 30 },
      "api",
    );

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("serving_config_versions"),
      [BRAND_ID, "api", null, 30, null, null, null, null],
    );
  });

  it("sends a rejection window of 0, which switches suppression off", async () => {
    queryMock.mockResolvedValueOnce(pgResult([VERSION_ROW]));

    await createServingConfigVersion(fakePool, BRAND_ID, { rejectionSuppressionDays: 0 }, "api");

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [BRAND_ID, "api", null, null, null, 0, null, null]);
  });

  it("throws ValidationError without querying for a rejection window above 365 days", async () => {
    await expect(
      createServingConfigVersion(fakePool, BRAND_ID, { rejectionSuppressionDays: 366 }, "api"),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("sends a repeat cooldown of 0, which switches rotation off", async () => {
    queryMock.mockResolvedValueOnce(pgResult([VERSION_ROW]));

    await createServingConfigVersion(fakePool, BRAND_ID, { repeatCooldownHours: 0 }, "api");

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [BRAND_ID, "api", null, null, null, null, 0, null]);
  });

  it("throws ValidationError without querying for a repeat cooldown above 720 hours", async () => {
    await expect(
      createServingConfigVersion(fakePool, BRAND_ID, { repeatCooldownHours: 721 }, "api"),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("sends a changed feedback window", async () => {
    queryMock.mockResolvedValueOnce(pgResult([VERSION_ROW]));

    await createServingConfigVersion(fakePool, BRAND_ID, { feedbackWindowMinutes: 30 }, "api");

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [BRAND_ID, "api", null, null, null, null, null, 30]);
  });

  it("throws ValidationError without querying for a feedback window outside 5 to 1440 minutes", async () => {
    for (const feedbackWindowMinutes of [4, 1441]) {
      await expect(
        createServingConfigVersion(fakePool, BRAND_ID, { feedbackWindowMinutes }, "api"),
      ).rejects.toThrow(ValidationError);
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the cooldown would not outlast the feedback window", async () => {
    queryMock.mockRejectedValueOnce({
      code: CHECK_VIOLATION,
      constraint: "serving_config_versions_cooldown_after_feedback_window_check",
    });

    await expect(
      createServingConfigVersion(fakePool, BRAND_ID, { repeatCooldownHours: 2 }, "api"),
    ).rejects.toThrow(ValidationError);
  });

  it("rethrows any other check violation as is", async () => {
    const error = { code: CHECK_VIOLATION, constraint: "serving_config_versions_other_check" };
    queryMock.mockRejectedValueOnce(error);

    await expect(
      createServingConfigVersion(fakePool, BRAND_ID, { repeatCooldownHours: 2 }, "api"),
    ).rejects.toBe(error);
  });
});
