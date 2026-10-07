import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerRecommendations } from "./customerRecommendations.service.js";

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const BRAND_ID = "22222222-2222-2222-2222-222222222222";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

describe("getCustomerRecommendations", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns recommendations when the customer exists", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: CUSTOMER_ID }] });

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

    const result = await getCustomerRecommendations(fakePool, CUSTOMER_ID);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.not.stringContaining("cis.brand_id"),
      [CUSTOMER_ID],
    );
    expect(result).toEqual({
      customerId: CUSTOMER_ID,
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
    queryMock.mockResolvedValueOnce({ rows: [{ id: CUSTOMER_ID }] });

    queryMock.mockResolvedValueOnce({ rows: [{ id: BRAND_ID }] });

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
      CUSTOMER_ID,
      BRAND_ID,
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("cis.brand_id = $2"),
      [CUSTOMER_ID, BRAND_ID],
    );
    expect(result).toEqual({
      customerId: CUSTOMER_ID,
      brandId: BRAND_ID,
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
