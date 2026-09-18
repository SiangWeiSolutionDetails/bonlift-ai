import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerRecommendations } from "./customerRecommendations.service.js";
import { genValidUuid } from "../utils/uuid.test-helpers.js";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

describe("getCustomerRecommendations", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns recommendations when the customer exists", async () => {
    const customerId = genValidUuid();

    queryMock.mockResolvedValueOnce({ rows: [{ id: customerId }] });

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

    const result = await getCustomerRecommendations(fakePool, customerId);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.not.stringContaining("cis.brand_id"),
      [customerId],
    );
    expect(result).toEqual({
      customerId: customerId,
      recommendations: [
        {
          refId: "1",
          itemName: "Item 1",
          category: "Category 1",
          score: 1,
        },
      ],
    });
  });

  it("returns recommendations when the customer and brand exist", async () => {
    const customerId = genValidUuid();
    const brandId = genValidUuid();

    queryMock.mockResolvedValueOnce({ rows: [{ id: customerId }] });

    queryMock.mockResolvedValueOnce({ rows: [{ id: brandId }] });

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

    const result = await getCustomerRecommendations(
      fakePool,
      customerId,
      brandId,
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("cis.brand_id = $2"),
      [customerId, brandId],
    );
    expect(result).toEqual({
      customerId: customerId,
      brandId: brandId,
      recommendations: [
        {
          refId: "1",
          itemName: "Item 1",
          category: "Category 1",
          score: 1,
        },
      ],
    });
  });
});
