import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { getItemAffinityRecommendations } from "./itemAffinityServing.service.js";

const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const REQUEST = { cart: [{ itemId: "A", qty: 1 }] };
const NO_ITEMS = { runId: null, items: [] };

const queryMock = vi.fn();
const logErrorMock = vi.fn();
const fakePool = { query: queryMock } as any;
const fakeLog = { error: logErrorMock } as any;

function recommend(request: any = REQUEST) {
  return getItemAffinityRecommendations(fakePool, fakeLog, BRAND_ID, request);
}

function itemRow(itemId: string | null) {
  return { run_id: RUN_ID, external_item_id: itemId };
}

function queryParams(overrides: Record<number, unknown> = {}) {
  const params: unknown[] = [BRAND_ID, ["A"], ["A"], [], null];
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
      runId: RUN_ID,
      items: [
        { itemId: "B", rank: 1, reason: "goes_with_cart" },
        { itemId: "C", rank: 2, reason: "goes_with_cart" },
      ],
    });
  });

  it("returns the run with no items when nothing goes with the cart", async () => {
    queryMock.mockResolvedValueOnce(pgResult([itemRow(null)]));

    expect(await recommend()).toStrictEqual({ runId: RUN_ID, items: [] });
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
    ["cart has more than 200 items", { cart: Array(201).fill({ itemId: "A", qty: 1 }) }],
    ["limit is above 50", { ...REQUEST, limit: 51 }],
    ["exclude has a blank item id", { ...REQUEST, exclude: [""] }],
    ["include has more than 500 items", { ...REQUEST, include: Array(501).fill("A") }],
  ])("throws ValidationError without querying when %s", async (_name, request) => {
    await expect(recommend(request)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
