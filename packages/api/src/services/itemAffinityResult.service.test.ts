import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import {
  getItemAffinityItemResult,
  getItemAffinityItems,
  getItemAffinityRun,
  getItemAffinityRuns,
  publishItemAffinityRun,
} from "./itemAffinityResult.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const STARTED_AT = new Date("2026-11-02T00:00:00.000Z");

function fakeRunRow(overrides: object = {}) {
  return {
    id: RUN_ID,
    brand_id: BRAND_ID,
    status: "succeeded",
    run_date: "2026-11-02",
    window_from: "2026-10-01",
    window_to: "2026-11-01",
    config_version: 1,
    top_n: 10,
    min_pair_orders: 10,
    max_order_items: 20,
    algorithm_version: "p4-order-lift",
    trigger_type: "manual",
    row_count: 5,
    error: null,
    started_at: STARTED_AT,
    finished_at: null,
    is_published: false,
    ...overrides,
  };
}

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

beforeEach(() => {
  queryMock.mockReset();
});

describe("getItemAffinityRuns", () => {
  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getItemAffinityRuns(fakePool, BRAND_ID, {})).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns an empty list when the brand has no runs", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ id: null }]));

    await expect(
      getItemAffinityRuns(fakePool, BRAND_ID, {}),
    ).resolves.toStrictEqual([]);
  });

  it("maps a run with its settings", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeRunRow()]));

    const [run] = await getItemAffinityRuns(fakePool, BRAND_ID, {});

    expect(run).toMatchObject({
      brandId: BRAND_ID,
      topN: 10,
      minPairOrders: 10,
      maxOrderItems: 20,
    });
  });
});

describe("getItemAffinityRun", () => {
  it("throws NotFoundError when the run does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getItemAffinityRun(fakePool, RUN_ID)).rejects.toThrow(NotFoundError);
  });

  it("looks the run up by id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeRunRow()]));

    await getItemAffinityRun(fakePool, RUN_ID);

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [RUN_ID]);
  });

  it("maps the run with its settings", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeRunRow()]));

    expect(await getItemAffinityRun(fakePool, RUN_ID)).toMatchObject({
      id: RUN_ID,
      brandId: BRAND_ID,
      topN: 10,
      minPairOrders: 10,
      maxOrderItems: 20,
    });
  });
});

describe("publishItemAffinityRun", () => {
  it("throws NotFoundError when the run does not belong to the brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      publishItemAffinityRun(fakePool, BRAND_ID, { runId: RUN_ID }),
    ).rejects.toThrow(NotFoundError);
  });

  it.each([
    { label: "failed", status: "failed" },
    { label: "empty", status: "succeeded" },
  ])("throws ConflictError for a $label run", async ({ status }) => {
    queryMock.mockResolvedValueOnce(
      pgResult([fakeRunRow({ status, was_published: false })]),
    );

    await expect(
      publishItemAffinityRun(fakePool, BRAND_ID, { runId: RUN_ID }),
    ).rejects.toThrow(ConflictError);
  });

  it("returns the run flagged as published", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([fakeRunRow({ was_published: true })]),
    );

    const run = await publishItemAffinityRun(fakePool, BRAND_ID, {
      runId: RUN_ID,
    });

    expect(run.isPublished).toBe(true);
  });
});

describe("getItemAffinityItems", () => {
  it("throws NotFoundError when the run does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getItemAffinityItems(fakePool, RUN_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns no items for a run without scores", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ item_id: null }]));

    await expect(
      getItemAffinityItems(fakePool, RUN_ID),
    ).resolves.toStrictEqual({ items: [] });
  });

  it("maps items in the order the query returns them", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        { item_id: "A", item_name: "Rice", n_orders: 9, pair_count: 2 },
        { item_id: "B", item_name: null, n_orders: 4, pair_count: 1 },
      ]),
    );

    await expect(
      getItemAffinityItems(fakePool, RUN_ID),
    ).resolves.toStrictEqual({
      items: [
        { itemId: "A", itemName: "Rice", nOrders: 9, pairCount: 2 },
        { itemId: "B", itemName: null, nOrders: 4, pairCount: 1 },
      ],
    });
  });
});

describe("getItemAffinityItemResult", () => {
  it.each([
    { label: "the run does not exist", rows: [] },
    { label: "the item is not in the run", rows: [{ partners: [] }] },
  ])("throws NotFoundError when $label", async ({ rows }) => {
    queryMock.mockResolvedValueOnce(pgResult(rows));

    await expect(
      getItemAffinityItemResult(fakePool, RUN_ID, "X"),
    ).rejects.toThrow(NotFoundError);
  });

  it("treats the item id as an opaque value", async () => {
    const partners = [
      {
        rank: 1,
        itemId: "Y",
        itemName: "Rice",
        nPair: 191,
        confidence: 0.79,
        lift: 2.93,
      },
    ];
    queryMock.mockResolvedValueOnce(
      pgResult([{ item_name: "Curry", n_orders: 241, partners }]),
    );

    const result = await getItemAffinityItemResult(
      fakePool,
      RUN_ID,
      "50%_a/b c",
    );

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      RUN_ID,
      "50%_a/b c",
    ]);
    expect(result).toStrictEqual({
      itemId: "50%_a/b c",
      itemName: "Curry",
      nOrders: 241,
      partners,
    });
  });
});
