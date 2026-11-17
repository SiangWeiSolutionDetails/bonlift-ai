import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { getItemAffinityRecommendations } from "./itemAffinityServing.service.js";

const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const OUTLET_ID = "11111111-1111-1111-1111-111111111111";
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const CUSTOMER_ID = "6591234567";
const REQUEST = { cart: [{ itemId: "A", qty: 1 }] };
const IDENTIFIED_REQUEST = { ...REQUEST, outletId: OUTLET_ID, customerId: CUSTOMER_ID };
const NO_ITEMS = { recommendationId: null, runId: null, items: [] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const queryMock = vi.fn();
const logErrorMock = vi.fn();
const fakePool = { query: queryMock } as any;
const fakeLog = { error: logErrorMock } as any;

function serveFor(request: any = REQUEST) {
  return getItemAffinityRecommendations(fakePool, fakeLog, BRAND_ID, request, SECRET);
}

async function recommend(request: any = REQUEST) {
  return (await serveFor(request)).response;
}

function itemRow(itemId: string | null, outletInBrand = true) {
  return { run_id: RUN_ID, external_item_id: itemId, outlet_in_brand: outletInBrand };
}

function queryParams(overrides: Record<number, unknown> = {}) {
  const params: unknown[] = [BRAND_ID, ["A"], ["A"], [], null, null, null];
  for (const [index, value] of Object.entries(overrides)) {
    params[Number(index) - 1] = value;
  }
  return params;
}

beforeEach(() => {
  queryMock.mockReset();
  logErrorMock.mockReset();
});

describe("getItemAffinityRecommendations", () => {
  it("returns the partners in the query's order, ranked by position", async () => {
    queryMock.mockResolvedValueOnce(pgResult([itemRow("B"), itemRow("C")]));

    expect(await recommend()).toStrictEqual({
      recommendationId: null,
      runId: RUN_ID,
      items: [
        { itemId: "B", rank: 1, reason: "often_ordered_with" },
        { itemId: "C", rank: 2, reason: "often_ordered_with" },
      ],
    });
  });

  it("returns the run with no items when nothing goes with the cart", async () => {
    queryMock.mockResolvedValueOnce(pgResult([itemRow(null)]));

    expect(await recommend()).toStrictEqual({ recommendationId: null, runId: RUN_ID, items: [] });
  });

  it("returns an empty list when there is no published run", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    expect(await recommend()).toStrictEqual(NO_ITEMS);
  });

  it("reads the brand's published run with no limit by default", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend();

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("brand_published_runs"),
      queryParams(),
    );
  });

  it("passes each cart item id once, both to match and to remove", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({
      cart: [
        { itemId: "A", qty: 1 },
        { itemId: "A", qty: 2 },
        { itemId: "B", qty: 1 },
      ],
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 2: ["A", "B"], 3: ["A", "B"] }),
    );
  });

  it("only removes excluded items, without matching them", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, exclude: ["X", "A", "X"] });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 3: ["A", "X"] }),
    );
  });

  it("matches only the target item and removes it with the cart", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, itemId: "T", exclude: ["X"] });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 2: ["T"], 3: ["T", "A", "X"] }),
    );
  });

  it("matches the target item even when the cart is empty", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ cart: [], itemId: "T" });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 2: ["T"], 3: ["T"] }),
    );
  });

  it("passes the target item once when it is also in the cart", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, itemId: "A" });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 2: ["A"], 3: ["A"] }),
    );
  });

  it("passes each included item id once", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, include: ["B", "C", "B"] });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 4: ["B", "C"] }),
    );
  });

  it("passes the requested limit", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, limit: 3 });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 5: 3 }),
    );
  });

  it("passes the hashed customer id and the outlet id, never the plain customer id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend(IDENTIFIED_REQUEST);

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 6: hashCustomerId(SECRET, CUSTOMER_ID), 7: OUTLET_ID }),
    );
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "  "],
  ])("passes no customer id when it is %s", async (_name, customerId) => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, outletId: OUTLET_ID, customerId });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), queryParams({ 7: OUTLET_ID }));
  });

  it("returns an empty list and logs the error when the query fails", async () => {
    const error = new Error("connection refused");
    queryMock.mockRejectedValueOnce(error);

    expect(await recommend()).toStrictEqual(NO_ITEMS);
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, brandId: BRAND_ID }),
      expect.any(String),
    );
  });

  it("accepts and ignores fields it does not know", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      recommend({ tableNo: "12", cart: [{ itemId: "A", qty: 1, note: "x" }] }),
    ).resolves.toStrictEqual(NO_ITEMS);
  });

  it.each([
    ["cart is missing", {}],
    ["cart has a blank item id", { cart: [{ itemId: "", qty: 1 }] }],
    ["itemId is blank", { ...REQUEST, itemId: "" }],
    ["cart has more than 200 items", { cart: Array(201).fill({ itemId: "A", qty: 1 }) }],
    ["limit is above 50", { ...REQUEST, limit: 51 }],
    ["exclude has a blank item id", { ...REQUEST, exclude: [""] }],
    ["include has more than 500 items", { ...REQUEST, include: Array(501).fill("A") }],
    ["customerId is malformed", { ...REQUEST, customerId: "not a customer" }],
    ["outletId is not a uuid", { ...REQUEST, outletId: "outlet-1" }],
  ])("throws ValidationError without querying when %s", async (_name, request) => {
    await expect(recommend(request)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("getItemAffinityRecommendations serve", () => {
  it("identifies a response with items and returns its serve, items in rank order", async () => {
    queryMock.mockResolvedValueOnce(pgResult([itemRow("B"), itemRow("C")]));

    const { response, serve } = await serveFor(IDENTIFIED_REQUEST);

    expect(response.recommendationId).toMatch(UUID);
    expect(serve).toStrictEqual({
      id: response.recommendationId,
      brandId: BRAND_ID,
      storedCustomerId: hashCustomerId(SECRET, CUSTOMER_ID),
      outletId: OUTLET_ID,
      daypart: "all_day",
      runId: null,
      customerRunId: null,
      affinityRunId: RUN_ID,
      itemIds: ["B", "C"],
      reasons: ["often_ordered_with", "often_ordered_with"],
    });
  });

  it("keeps the hashed customer id on the serve, never the plain one", async () => {
    queryMock.mockResolvedValueOnce(pgResult([itemRow("B")]));

    const { serve } = await serveFor(IDENTIFIED_REQUEST);

    expect(JSON.stringify(serve)).not.toContain(CUSTOMER_ID);
  });

  it.each([
    ["the customer is anonymous", { ...REQUEST, outletId: OUTLET_ID }, [itemRow("B", true)]],
    ["no outlet is sent", { ...REQUEST, customerId: CUSTOMER_ID }, [itemRow("B", false)]],
    ["the outlet is not an active outlet of the brand", IDENTIFIED_REQUEST, [itemRow("B", false)]],
    ["no item is returned", IDENTIFIED_REQUEST, [itemRow(null)]],
    ["there is no published run", IDENTIFIED_REQUEST, []],
  ])("has no id and no serve when %s", async (_name, request, rows) => {
    queryMock.mockResolvedValueOnce(pgResult(rows));

    const { response, serve } = await serveFor(request);

    expect(response.recommendationId).toBeNull();
    expect(serve).toBeNull();
  });

  it("has no id and no serve when the query fails", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));

    expect(await serveFor(IDENTIFIED_REQUEST)).toStrictEqual({ response: NO_ITEMS, serve: null });
  });
});
