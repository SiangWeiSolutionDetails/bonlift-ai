import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { getRecommendations } from "./recommendation.service.js";

const OUTLET_ID = "11111111-1111-1111-1111-111111111111";
const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const AT = "2026-11-02T12:30:00+08:00";
const REQUEST = { outletId: OUTLET_ID, at: AT, cart: [] };

const queryMock = vi.fn();
const logErrorMock = vi.fn();
const fakePool = { query: queryMock } as any;
const logWarnMock = vi.fn();
const fakeLog = { error: logErrorMock, warn: logWarnMock } as any;

function recommend(request: any = REQUEST) {
  return getRecommendations(fakePool, fakeLog, BRAND_ID, request);
}

function itemRow(itemId: string | null, daypart: string | null = "Lunch") {
  return { in_brand: true, run_id: RUN_ID, daypart, external_item_id: itemId };
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
      daypart: "Lunch",
      items: [
        { itemId: "A", rank: 1, reason: "popular_at_outlet" },
        { itemId: "B", rank: 2, reason: "popular_at_outlet" },
        { itemId: "C", rank: 3, reason: "popular_at_outlet" },
      ],
    });
  });

  it("reads the published run of the outlet with the default limit", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend();

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("published_runs"),
      [OUTLET_ID, AT, [], 10, BRAND_ID],
    );
  });

  it("passes each cart item id once to be excluded", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({
      ...REQUEST,
      cart: [
        { itemId: "A", qty: 1 },
        { itemId: "B", qty: 2 },
        { itemId: "A", qty: 1 },
      ],
    });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      OUTLET_ID,
      AT,
      ["A", "B"],
      10,
      BRAND_ID,
    ]);
  });

  it("passes the requested limit", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, limit: 3 });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      OUTLET_ID,
      AT,
      [],
      3,
      BRAND_ID,
    ]);
  });

  it("returns an empty list for an unknown or inactive outlet", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    expect(await recommend()).toStrictEqual({
      runId: null,
      daypart: null,
      items: [],
    });
  });

  it("returns an empty list when the outlet has no published run", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ in_brand: true, run_id: null, daypart: null, external_item_id: null }]),
    );

    expect(await recommend()).toStrictEqual({
      runId: null,
      daypart: null,
      items: [],
    });
  });

  it("returns the run with no items when the time is outside every daypart", async () => {
    queryMock.mockResolvedValueOnce(pgResult([itemRow(null, null)]));

    expect(await recommend()).toStrictEqual({
      runId: RUN_ID,
      daypart: null,
      items: [],
    });
  });

  it("returns an empty list and logs a warning for another brand's outlet", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ in_brand: false, run_id: null, daypart: null, external_item_id: null }]),
    );

    expect(await recommend()).toStrictEqual({
      runId: null,
      daypart: null,
      items: [],
    });
    expect(logWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ outletId: OUTLET_ID }),
      expect.any(String),
    );
  });

  it("returns an empty list and logs the error when the query fails", async () => {
    const error = new Error("connection refused");
    queryMock.mockRejectedValueOnce(error);

    expect(await recommend()).toStrictEqual({
      runId: null,
      daypart: null,
      items: [],
    });
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, outletId: OUTLET_ID }),
      expect.any(String),
    );
  });

  it("accepts and ignores fields it does not know", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      recommend({ ...REQUEST, tableNo: "12", cart: [{ itemId: "A", qty: 1, note: "x" }] }),
    ).resolves.toStrictEqual({ runId: null, daypart: null, items: [] });
  });

  it.each([
    ["outletId is not a uuid", { ...REQUEST, outletId: "outlet-1" }],
    ["at has no offset", { ...REQUEST, at: "2026-11-02T12:30:00" }],
    ["at is UTC (Z)", { ...REQUEST, at: "2026-11-02T04:30:00Z" }],
    ["cart is missing", { outletId: OUTLET_ID, at: AT }],
    ["limit is above 50", { ...REQUEST, limit: 51 }],
  ])("throws ValidationError without querying when %s", async (_name, request) => {
    await expect(recommend(request)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
