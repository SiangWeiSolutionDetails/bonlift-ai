import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { recordRecommendationFeedback } from "./recommendationFeedback.service.js";

const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const RECOMMENDATION_ID = "66666666-6666-6666-6666-666666666666";
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const CUSTOMER_ID = "6591234567";
const CUSTOMER_HASH = hashCustomerId(SECRET, CUSTOMER_ID);

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function feedback(body: any, recommendationId = RECOMMENDATION_ID) {
  return recordRecommendationFeedback(fakePool, BRAND_ID, recommendationId, body, SECRET);
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("recordRecommendationFeedback", () => {
  it.each(["accepted", "rejected"])("records %s feedback for the key's brand", async (type) => {
    queryMock.mockResolvedValueOnce(pgResult([{ matched: 1 }]));

    await feedback({ itemId: "A", type, customerId: CUSTOMER_ID });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("recommendation_serves"), [
      RECOMMENDATION_ID,
      BRAND_ID,
      "A",
      type,
      CUSTOMER_HASH,
    ]);
  });

  it("passes the customer id by its hash, never the plain id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ matched: 1 }]));

    await feedback({ itemId: "A", type: "rejected", customerId: "Tan@Mail.COM" });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      RECOMMENDATION_ID,
      BRAND_ID,
      "A",
      "rejected",
      hashCustomerId(SECRET, "tan@mail.com"),
    ]);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "  "],
  ])("throws ValidationError without querying when the customer id is %s", async (_name, customerId) => {
    await expect(feedback({ itemId: "A", type: "accepted", customerId })).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("resolves the same way whether or not a serve matched", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ matched: 0 }]));

    await expect(feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID })).resolves.toBeUndefined();
  });

  it("accepts and ignores fields it does not know", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ matched: 1 }]));

    await feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID, channel: "tqr", tableNo: "12" });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      RECOMMENDATION_ID,
      BRAND_ID,
      "A",
      "accepted",
      CUSTOMER_HASH,
    ]);
  });

  it("throws ValidationError without querying for a malformed customer id, never echoing it", async () => {
    const error = await feedback({ itemId: "A", type: "rejected", customerId: "+6591234567" }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).not.toContain("6591234567");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the recommendation id is not a uuid", { itemId: "A", type: "accepted" }, "rec-1"],
    ["itemId is missing", { type: "accepted" }, RECOMMENDATION_ID],
    ["itemId is blank", { itemId: "", type: "accepted" }, RECOMMENDATION_ID],
    ["type is unknown", { itemId: "A", type: "ignored" }, RECOMMENDATION_ID],
  ])("throws ValidationError without querying when %s", async (_name, body, recommendationId) => {
    await expect(feedback(body, recommendationId)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("lets a database error through, so the caller can retry", async () => {
    const error = new Error("connection refused");
    queryMock.mockRejectedValueOnce(error);

    await expect(feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID })).rejects.toBe(error);
  });
});
