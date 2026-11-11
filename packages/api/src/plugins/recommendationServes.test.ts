import { beforeEach, describe, expect, it, vi } from "vitest";
import { pgResult } from "../utils/pg.test-helpers.js";
import { createRecommendationServeHook } from "./recommendationServes.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const CHANNEL_ID = "33333333-3333-3333-3333-333333333333";
const SERVE = {
  id: "66666666-6666-6666-6666-666666666666",
  brandId: BRAND_ID,
  outletId: "44444444-4444-4444-4444-444444444444",
  isIdentified: true,
  daypart: "lunch",
  runId: "55555555-5555-5555-5555-555555555555",
  customerRunId: null,
  affinityRunId: null,
  itemIds: ["A", "B"],
  reasons: ["popular_at_outlet", "popular_at_outlet"],
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;
const errorLog = vi.fn();

function request(overrides: Record<string, unknown> = {}) {
  return {
    recommendationServe: SERVE,
    servingChannel: { id: CHANNEL_ID, code: "tqr", isActive: true },
    log: { error: errorLog },
    ...overrides,
  } as any;
}

function reply(statusCode = 200) {
  return { statusCode } as any;
}

const hook = createRecommendationServeHook(() => fakePool);

beforeEach(() => {
  queryMock.mockReset();
  errorLog.mockReset();
});

describe("createRecommendationServeHook", () => {
  it("records the serve with the key's channel", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await hook(request(), reply());

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("recommendation_serves"), [
      SERVE.id,
      BRAND_ID,
      CHANNEL_ID,
      SERVE.outletId,
      true,
      "lunch",
      SERVE.runId,
      null,
      null,
      ["A", "B"],
      ["popular_at_outlet", "popular_at_outlet"],
    ]);
  });

  it("records the serve with no channel for a key without one", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await hook(request({ servingChannel: null }), reply());

    expect(queryMock.mock.calls[0][1][2]).toBeNull();
  });

  it("records nothing when no items were served", async () => {
    await hook(request({ recommendationServe: null }), reply());

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
      "Recommendation serve was not recorded",
    );
  });
});
