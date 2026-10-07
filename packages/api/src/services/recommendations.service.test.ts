import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOutletRecommendations } from "./recommendations.service.js";

const OUTLET_ID = "11111111-1111-1111-1111-111111111111";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

describe("getOutletRecommendations", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns recommendations when the outlet exists", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: OUTLET_ID }] });

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

    const result = await getOutletRecommendations(fakePool, OUTLET_ID);

    expect(result).toEqual({
      outletId: OUTLET_ID,
      recommendations: [
        { refId: "1", itemName: "Item 1", category: "Category 1", score: 1 },
      ],
    });
  });
});
