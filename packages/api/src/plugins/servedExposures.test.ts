import { beforeEach, describe, expect, it, vi } from "vitest";
import { pgResult } from "../utils/pg.test-helpers.js";
import { createServedExposureHook } from "./servedExposures.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const EXPOSURE = {
  brandId: BRAND_ID,
  storedCustomerId: "hashed-customer",
  itemIds: ["A", "B"],
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;
const errorLog = vi.fn();

function request(overrides: Record<string, unknown> = {}) {
  return {
    servedExposure: EXPOSURE,
    log: { error: errorLog },
    ...overrides,
  } as any;
}

function reply(statusCode = 200) {
  return { statusCode } as any;
}

const hook = createServedExposureHook(() => fakePool);

beforeEach(() => {
  queryMock.mockReset();
  errorLog.mockReset();
});

describe("createServedExposureHook", () => {
  it("records the served items as shown to the customer", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 2));

    await hook(request(), reply());

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("customer_item_exposures"), [
      BRAND_ID,
      "hashed-customer",
      ["A", "B"],
    ]);
  });

  it("no longer records a serve", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 2));

    await hook(request(), reply());

    expect(queryMock.mock.calls[0][0]).not.toContain("recommendation_serves");
  });

  it("records nothing when no items were shown to a known customer", async () => {
    await hook(request({ servedExposure: null }), reply());

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("records nothing when the reply failed", async () => {
    await hook(request(), reply(500));

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("logs a failed write instead of throwing", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));

    await expect(hook(request(), reply())).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Served items were not recorded as shown",
    );
  });
});
