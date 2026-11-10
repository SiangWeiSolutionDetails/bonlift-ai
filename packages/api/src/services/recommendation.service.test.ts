import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { getRecommendations } from "./recommendation.service.js";

const OUTLET_ID = "11111111-1111-1111-1111-111111111111";
const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const CUSTOMER_RUN_ID = "44444444-4444-4444-4444-444444444444";
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
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
  return getRecommendations(fakePool, fakeLog, BRAND_ID, request, SECRET);
}

const NO_DETAIL_COLUMNS: Record<string, string[] | number | null> = {
  based_on: null,
  top_pair_confidence: null,
  top_pair_lift: null,
  top_pair_sample: null,
  outlet_rank: null,
  outlet_list_size: null,
};

function itemRow(itemId: string | null, daypart: string | null = "Lunch") {
  return {
    in_brand: true,
    run_id: RUN_ID,
    customer_run_id: null,
    affinity_run_id: null,
    daypart,
    external_item_id: itemId,
    source: itemId === null ? null : "outlet",
    ...NO_DETAIL_COLUMNS,
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
    ...NO_DETAIL_COLUMNS,
  };
}

function cartRow(itemId: string, pair: Record<string, unknown> = {}) {
  return {
    in_brand: true,
    run_id: RUN_ID,
    customer_run_id: null,
    affinity_run_id: AFFINITY_RUN_ID,
    daypart: "Lunch",
    external_item_id: itemId,
    source: "cart",
    ...NO_DETAIL_COLUMNS,
    ...pair,
  };
}

function topPair(confidence: number, lift: number, sample: number) {
  return {
    based_on: ["KOPI"],
    top_pair_confidence: confidence,
    top_pair_lift: lift,
    top_pair_sample: sample,
  };
}

function outletRow(itemId: string, outletRank: number, outletListSize: number) {
  return { ...itemRow(itemId), outlet_rank: outletRank, outlet_list_size: outletListSize };
}

async function servedItem(row: Record<string, unknown>) {
  queryMock.mockResolvedValueOnce(pgResult([row]));
  const result = await recommend({ ...REQUEST, cart: [{ itemId: "KOPI", qty: 1 }] });
  return result.items[0];
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
    ...NO_DETAIL_COLUMNS,
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

    const result = await recommend({ ...REQUEST, customerId: "6591234567" });

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
      customerId: "6591234567",
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
          ...NO_DETAIL_COLUMNS,
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

    expect(await recommend({ ...REQUEST, customerId: "6591234567" })).toStrictEqual({
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

  it.each([
    { label: "a mobile number", customerId: " 6591234567\t", normalised: "6591234567" },
    { label: "an email, lower-cased", customerId: "Tan@Mail.COM", normalised: "tan@mail.com" },
  ])("looks up $label by its hash, never the plain id", async ({ customerId, normalised }) => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await recommend({ ...REQUEST, customerId });

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      queryParams({ 7: hashCustomerId(SECRET, normalised) }),
    );
  });

  it.each([
    ["has a leading +", "+6591234567"],
    ["uses the legacy name prefix", "tan-6591234567"],
    ["is too short", "6512345"],
    ["is not an email", "tan@mail"],
  ])("throws ValidationError without querying when the customer id %s", async (_name, customerId) => {
    await expect(recommend({ ...REQUEST, customerId })).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
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

  describe("reason detail", () => {
    it("omits detail when nothing applies", async () => {
      queryMock.mockResolvedValueOnce(
        pgResult([favouriteRow("F1"), cartRow("P1"), outletRow("A", 4, 10)]),
      );

      const result = await recommend({
        ...REQUEST,
        customerId: "6591234567",
        cart: [{ itemId: "KOPI", qty: 1 }],
      });

      expect(result.items).toStrictEqual([
        { itemId: "F1", rank: 1, reason: "frequently_ordered" },
        { itemId: "P1", rank: 2, reason: "goes_with_cart" },
        { itemId: "A", rank: 3, reason: "popular_at_outlet" },
      ]);
    });

    it("lists the cart items an item goes with, in the query's order", async () => {
      expect(await servedItem(cartRow("P1", { based_on: ["KOPI", "TOAST"] }))).toStrictEqual({
        itemId: "P1",
        rank: 1,
        reason: "goes_with_cart",
        detail: { basedOn: ["KOPI", "TOAST"] },
      });
    });

    it("lists the cart items a favourite goes with", async () => {
      expect(await servedItem({ ...favouriteRow("F1"), based_on: ["KOPI"] })).toStrictEqual({
        itemId: "F1",
        rank: 1,
        reason: "frequently_ordered",
        detail: { basedOn: ["KOPI"] },
      });
    });

    it("gives the top pair's share once the pair has 50 orders", async () => {
      expect(await servedItem(cartRow("P1", topPair(0.67, 1.5, 50)))).toStrictEqual({
        itemId: "P1",
        rank: 1,
        reason: "goes_with_cart",
        detail: { basedOn: ["KOPI"], pairShare: 0.67 },
      });
    });

    it("gives a share of exactly 0.1 and omits one below it", async () => {
      expect((await servedItem(cartRow("P1", topPair(0.1, 1.5, 50)))).detail).toStrictEqual({
        basedOn: ["KOPI"],
        pairShare: 0.1,
      });
      expect((await servedItem(cartRow("P1", topPair(0.09, 1.5, 50)))).detail).toStrictEqual({
        basedOn: ["KOPI"],
      });
    });

    it("keeps a strong pairing when the share is too small to show", async () => {
      expect((await servedItem(cartRow("P1", topPair(0.04, 2.5, 400)))).detail).toStrictEqual({
        basedOn: ["KOPI"],
        strongPairing: true,
      });
    });

    it("lists at most 3 cart items", async () => {
      expect(
        (await servedItem(cartRow("P1", { based_on: ["A", "B", "C", "D"] }))).detail,
      ).toStrictEqual({ basedOn: ["A", "B", "C"] });
    });

    it("omits the share and strong pairing when the top pair has fewer than 50 orders", async () => {
      expect(await servedItem(cartRow("P1", topPair(0.7, 3, 49)))).toStrictEqual({
        itemId: "P1",
        rank: 1,
        reason: "goes_with_cart",
        detail: { basedOn: ["KOPI"] },
      });
    });

    it("marks a strong pairing at a lift of exactly 2", async () => {
      expect(await servedItem(cartRow("P1", topPair(0.7, 2, 50)))).toStrictEqual({
        itemId: "P1",
        rank: 1,
        reason: "goes_with_cart",
        detail: { basedOn: ["KOPI"], pairShare: 0.7, strongPairing: true },
      });
    });

    it("does not mark a strong pairing at a lift of 1.99", async () => {
      expect(await servedItem(cartRow("P1", topPair(0.7, 1.99, 50)))).toStrictEqual({
        itemId: "P1",
        rank: 1,
        reason: "goes_with_cart",
        detail: { basedOn: ["KOPI"], pairShare: 0.7 },
      });
    });

    it("never gives a favourite a share or strong pairing, even with pair columns set", async () => {
      expect(
        await servedItem({ ...favouriteRow("F1"), ...topPair(0.7, 3, 100) }),
      ).toStrictEqual({
        itemId: "F1",
        rank: 1,
        reason: "frequently_ordered",
        detail: { basedOn: ["KOPI"] },
      });
    });

    it.each([
      { label: "marks", outletRank: 3, listSize: 10, detail: { bestSeller: true } },
      { label: "does not mark", outletRank: 4, listSize: 10, detail: undefined },
      { label: "does not mark", outletRank: 3, listSize: 9, detail: undefined },
    ])(
      "$label a best seller at stored rank $outletRank of a $listSize-item list",
      async ({ outletRank, listSize, detail }) => {
        expect(await servedItem(outletRow("A", outletRank, listSize))).toStrictEqual({
          itemId: "A",
          rank: 1,
          reason: "popular_at_outlet",
          ...(detail && { detail }),
        });
      },
    );
  });
});
