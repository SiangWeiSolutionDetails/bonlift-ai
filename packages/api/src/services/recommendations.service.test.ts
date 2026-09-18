import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOutletRecommendations } from "./recommendations.service.js";
import { genValidUuid } from "../utils/uuid.test-helpers.js";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

describe("getOutletRecommendations", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns recommendations when the outlet exists", async () => {
    const outletId = genValidUuid();

    queryMock.mockResolvedValueOnce({ rows: [{ id: outletId }] });

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          item_ref_id: "1",
          item_name: "Item 1",
          item_category: "Category 1",
          score: "1",
        },
      ],
    });

    const result = await getOutletRecommendations(fakePool, outletId);

    expect(result).toEqual({
      outletId: outletId,
      recommendations: [
        { refId: "1", itemName: "Item 1", category: "Category 1", score: 1 },
      ],
    });
  });
});
