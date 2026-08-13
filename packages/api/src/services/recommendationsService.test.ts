import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOutletRecommendations } from "./recommendationsService.js";
import { NotFoundError } from "../errors.js";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

describe("getOutletRecommendations", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("throws NotFoundError when the outlet does not exist", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(
      getOutletRecommendations(fakePool, "nonexistent-id"),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns recommendations when the outlet exists", async () => {
    const outletId = "some-id";

    queryMock.mockResolvedValueOnce({ rows: [{}] });

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          item_ref_id: "1",
          item_name: "Item 1",
          item_category: "mains",
          score: "10.5",
        },
      ],
    });

    const result = await getOutletRecommendations(fakePool, outletId);

    expect(result).toEqual({
      outletId: outletId,
      recommendations: [
        { refId: "1", itemName: "Item 1", category: "mains", score: 10.5 },
      ],
    });
  });
});
