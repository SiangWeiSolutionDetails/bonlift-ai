import { describe, expect, it } from "vitest";
import { validateRecommendationFeedbackSearch } from "./search";

describe("validateRecommendationFeedbackSearch", () => {
  const outletId = "0b5f2d8e-6f1a-4c3b-9a7e-2d4c6b8a0f13";

  it("keeps valid filters", () => {
    expect(
      validateRecommendationFeedbackSearch({
        brandId: "brand",
        from: "2026-11-01",
        to: "2026-11-30",
        outletId,
        daypart: "lunch",
        reason: "frequently_ordered",
        channelId: outletId,
        runId: outletId,
      }),
    ).toEqual({
      brandId: "brand",
      from: "2026-11-01",
      to: "2026-11-30",
      outletId,
      daypart: "lunch",
      reason: "frequently_ordered",
      channelId: outletId,
      runId: outletId,
    });
  });

  it("drops filters the API would reject", () => {
    expect(
      validateRecommendationFeedbackSearch({
        outletId: "not-a-uuid",
        daypart: "x".repeat(65),
        reason: "goes_with_cart",
        channelId: 42,
        runId: "not-a-uuid",
      }),
    ).toMatchObject({
      outletId: undefined,
      daypart: undefined,
      reason: undefined,
      channelId: undefined,
      runId: undefined,
    });
  });
});
