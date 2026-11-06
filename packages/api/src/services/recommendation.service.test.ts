import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { getRecommendations } from "./recommendation.service.js";

const OUTLET_ID = "11111111-1111-1111-1111-111111111111";
const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const CUSTOMER_RUN_ID = "44444444-4444-4444-4444-444444444444";
const AFFINITY_RUN_ID = "55555555-5555-5555-5555-555555555555";
const REQUEST = { outletId: OUTLET_ID, cart: [] };
const NO_RECOMMENDATIONS = {
  runId: null,
  customerRunId: null,
  affinityRunId: null,
  daypart: null,
  items: [],
};

const queryMock = vi.fn();
const logErrorMock = vi.fn();
const fakePool = { query: queryMock } as any;
const logWarnMock = vi.fn();
const fakeLog = { error: logErrorMock, warn: logWarnMock } as any;

function recommend(request: any = REQUEST) {
  return getRecommendations(fakePool, fakeLog, BRAND_ID, request);
}

function itemRow(itemId: string | null, daypart: string | null = "Lunch") {
  return {
    in_brand: true,
    run_id: RUN_ID,
    customer_run_id: null,
    affinity_run_id: null,
    daypart,
    external_item_id: itemId,
    source: itemId === null ? null : "outlet",
  };
}

function favouriteRow(itemId: string, runId: string | null = RUN_ID) {
  return {
    in_brand: true,
    run_id: runId,
    customer_run_id: CUSTOMER_RUN_ID,
    affinity_run_id: null,
    daypart: runId === null ? null : "Lunch",
    external_item_id: itemId,
    source: "customer",
  };
}

function queryParams(overrides: Record<number, unknown> = {}) {
  const params: unknown[] = [OUTLET_ID, "all_day", [], null, BRAND_ID, [], null, 2, []];
  for (const [index, value] of Object.entries(overrides)) {
    params[Number(index) - 1] = value;
  }
  return params;
}

function emptyOutletRow(inBrand = true) {
  return {
    in_brand: inBrand,
    run_id: null,
    customer_run_id: null,
    affinity_run_id: null,
    daypart: null,
    external_item_id: null,
    source: null,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  logErrorMock.mockReset();
  logWarnMock.mockReset();
});

describe("getRecommendations", () => {
  it("returns the published items in order, ranked by position", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([itemRow("A"), itemRow("B"), itemRow("C")]),
    );

    const result = await recommend();

    expect(result).toStrictEqual({
      runId: RUN_ID,
      customerRunId: null,
      affinityRunId: null,
      daypart: "Lunch",
      items: [
        { itemId: "A", rank: 1, reason: "popular_at_outlet" },
        { itemId: "B", rank: 2, reason: "popular_at_outlet" },
        { itemId: "C", rank: 3, reason: "popular_at_outlet" },
      ],
    });
  });

  it("puts favourites first with their own reason, keeping the query's order", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        favouriteRow("F1"),
        favouriteRow("F2"),
        { ...itemRow("A"), customer_run_id: CUSTOMER_RUN_ID },
      ]),
    );

    const result = await recommend({ ...REQUEST, customerId: "C1" });

    expect(result).toStrictEqual({
      runId: RUN_ID,
      customerRunId: CUSTOMER_RUN_ID,
      affinityRunId: null,
      daypart: "Lunch",
      items: [
        { itemId: "F1", rank: 1, reason: "frequently_ordered" },
        { itemId: "F2", rank: 2, reason: "frequently_ordered" },
        { itemId: "A", rank: 3, reason: "popular_at_outlet" },
      ],
    });
  });

  it("gives items that go with the cart their own reason, between favourites and popular items", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        favouriteRow("F1"),
        { ...favouriteRow("P1"), source: "cart" },
        { ...itemRow("A"), customer_run_id: CUSTOMER_RUN_ID },
      ]),
    );

    const result = await recommend({
      ...REQUEST,
      customerId: "C1",
      cart: [{ itemId: "X", qty: 1 }],
    });

    expect(result.items).toStrictEqual([
      { itemId: "F1", rank: 1, reason: "frequently_ordered" },
      { itemId: "P1", rank: 2, reason: "goes_with_cart" },
      { itemId: "A", rank: 3, reason: "popular_at_outlet" },
    ]);
  });

  it("returns items that go with the cart when neither the outlet nor the customer has a run", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        {
          in_brand: true,
          run_id: null,
          customer_run_id: null,
          affinity_run_id: AFFINITY_RUN_ID,
          daypart: "all_day",
          external_item_id: "P1",
          source: "cart",
        },
      ]),
    );

    expect(await recommend({ ...REQUEST, cart: [{ itemId: "X", qty: 1 }] })).toStrictEqual({
      runId: null,
      customerRunId: null,
      affinityRunId: AFFINITY_RUN_ID,
      daypart: "all_day",
      items: [{ itemId: "P1", rank: 1, reason: "goes_with_cart" }],
    });
  });

  it("returns favourites when the outlet has no published run", async () => {
    queryMock.mockResolvedValueOnce(pgResult([favouriteRow("F1", null)]));

    expect(await recommend({ ...REQUEST, customerId: "C1" })).toStrictEqual({
      runId: null,
      customerRunId: CUSTOMER_RUN_ID,
      affinityRunId: null,
      daypart: null,
      items: [{ itemId: "F1", rank: 1, reason: "frequently_ordered" }],
    });
  });

  it("reads the published runs with no limit by default", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend();

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("published_runs"),
      queryParams(),
    );
  });

  it("passes each cart item id once, both to remove and to match", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({
      ...REQUEST,
      cart: [
        { itemId: "A", qty: 1 },
        { itemId: "B", qty: 2 },
        { itemId: "A", qty: 1 },
      ],
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 3: ["A", "B"], 6: ["A", "B"] }),
    );
  });

  it("only removes excluded items, without matching them", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({
      ...REQUEST,
      cart: [{ itemId: "A", qty: 1 }],
      exclude: ["B", "A", "B"],
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 3: ["A", "B"], 6: ["A"] }),
    );
  });

  it("passes each included item id once", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, include: ["C", "D", "C"] });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 9: ["C", "D"] }),
    );
  });

  it("passes the requested daypart", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, daypart: "Lunch" });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 2: "Lunch" }),
    );
  });

  it("ignores a time sent by an older caller and serves the whole day", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, at: "2026-11-02T12:30:00+08:00" });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), queryParams());
  });

  it("passes the requested limit", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, limit: 10 });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 4: 10 }),
    );
  });

  it("passes the customer id without surrounding whitespace", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, customerId: " C1\t" });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 7: "C1" }),
    );
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "  \r\n"],
  ])("treats a %s customer id as anonymous", async (_name, customerId) => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, customerId });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), queryParams());
  });

  it("returns an empty list for an unknown or inactive outlet", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    expect(await recommend()).toStrictEqual(NO_RECOMMENDATIONS);
  });

  it("returns an empty list when there is no published run", async () => {
    queryMock.mockResolvedValueOnce(pgResult([emptyOutletRow()]));

    expect(await recommend()).toStrictEqual(NO_RECOMMENDATIONS);
  });

  it("returns the run with no items when the daypart has no stored items", async () => {
    queryMock.mockResolvedValueOnce(pgResult([itemRow(null, "Supper")]));

    expect(await recommend({ ...REQUEST, daypart: "Supper" })).toStrictEqual({
      runId: RUN_ID,
      customerRunId: null,
      affinityRunId: null,
      daypart: "Supper",
      items: [],
    });
  });

  it("returns an empty list and logs a warning for another brand's outlet", async () => {
    queryMock.mockResolvedValueOnce(pgResult([emptyOutletRow(false)]));

    expect(await recommend()).toStrictEqual(NO_RECOMMENDATIONS);
    expect(logWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ outletId: OUTLET_ID }),
      expect.any(String),
    );
  });

  it("returns an empty list and logs the error when the query fails", async () => {
    const error = new Error("connection refused");
    queryMock.mockRejectedValueOnce(error);

    expect(await recommend()).toStrictEqual(NO_RECOMMENDATIONS);
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, outletId: OUTLET_ID }),
      expect.any(String),
    );
  });

  it("accepts and ignores fields it does not know", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      recommend({ ...REQUEST, tableNo: "12", cart: [{ itemId: "A", qty: 1, note: "x" }] }),
    ).resolves.toStrictEqual(NO_RECOMMENDATIONS);
  });

  it.each([
    ["outletId is not a uuid", { ...REQUEST, outletId: "outlet-1" }],
    ["cart is missing", { outletId: OUTLET_ID }],
    ["daypart is blank", { ...REQUEST, daypart: "" }],
    ["limit is above 50", { ...REQUEST, limit: 51 }],
    ["exclude has more than 200 items", { ...REQUEST, exclude: Array(201).fill("A") }],
    ["exclude has a blank item id", { ...REQUEST, exclude: [""] }],
    ["include has more than 500 items", { ...REQUEST, include: Array(501).fill("A") }],
    ["include has a blank item id", { ...REQUEST, include: [""] }],
  ])("throws ValidationError without querying when %s", async (_name, request) => {
    await expect(recommend(request)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
