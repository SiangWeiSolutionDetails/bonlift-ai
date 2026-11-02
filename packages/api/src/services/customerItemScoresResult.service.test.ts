import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import {
  getCustomerItemScoresCustomerResult,
  getCustomerItemScoresCustomers,
  getCustomerItemScoresRuns,
  publishCustomerItemScoresRun,
} from "./customerItemScoresResult.service.js";

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
    half_life_days: 14,
    top_n: 20,
    algorithm_version: "h5-customer-recency",
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

describe("getCustomerItemScoresRuns", () => {
  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      getCustomerItemScoresRuns(fakePool, BRAND_ID, {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns an empty list when the brand has no runs", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ id: null }]));

    await expect(
      getCustomerItemScoresRuns(fakePool, BRAND_ID, {}),
    ).resolves.toStrictEqual([]);
  });

  it("maps a run with its brand and no dayparts", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeRunRow()]));

    const [run] = await getCustomerItemScoresRuns(fakePool, BRAND_ID, {});

    expect(run.brandId).toBe(BRAND_ID);
    expect(run).not.toHaveProperty("dayparts");
    expect(run).not.toHaveProperty("outletId");
  });
});

describe("publishCustomerItemScoresRun", () => {
  it("throws NotFoundError when the run does not belong to the brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      publishCustomerItemScoresRun(fakePool, BRAND_ID, { runId: RUN_ID }),
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
      publishCustomerItemScoresRun(fakePool, BRAND_ID, { runId: RUN_ID }),
    ).rejects.toThrow(ConflictError);
  });

  it("returns the run flagged as published", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([fakeRunRow({ was_published: true })]),
    );

    const run = await publishCustomerItemScoresRun(fakePool, BRAND_ID, {
      runId: RUN_ID,
    });

    expect(run.isPublished).toBe(true);
  });
});

describe("getCustomerItemScoresCustomers", () => {
  it("throws NotFoundError when the run does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      getCustomerItemScoresCustomers(fakePool, RUN_ID, {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns no customers for a run without scores", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ customer_id: null }]));

    await expect(
      getCustomerItemScoresCustomers(fakePool, RUN_ID, {}),
    ).resolves.toStrictEqual({ customers: [], nextAfter: null });
  });

  it("fetches one extra row and returns nextAfter when more customers exist", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        { customer_id: "A", item_count: 2 },
        { customer_id: "B", item_count: 1 },
        { customer_id: "C", item_count: 1 },
      ]),
    );

    const result = await getCustomerItemScoresCustomers(fakePool, RUN_ID, {
      limit: 2,
    });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      RUN_ID,
      null,
      null,
      3,
    ]);
    expect(result).toStrictEqual({
      customers: [
        { customerId: "A", itemCount: 2 },
        { customerId: "B", itemCount: 1 },
      ],
      nextAfter: "B",
    });
  });

  it("returns a null nextAfter on the last page", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ customer_id: "A", item_count: 2 }]),
    );

    const result = await getCustomerItemScoresCustomers(fakePool, RUN_ID, {
      limit: 2,
    });

    expect(result.nextAfter).toBeNull();
  });

  it("passes search text unmodified and matches it literally", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await getCustomerItemScoresCustomers(fakePool, RUN_ID, {
      search: "50%_a/b",
    }).catch(() => undefined);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("starts_with"),
      [RUN_ID, null, "50%_a/b", 51],
    );
  });
});

describe("getCustomerItemScoresCustomerResult", () => {
  it.each([
    { label: "the run does not exist", rows: [] },
    { label: "the customer is not in the run", rows: [{ items: [] }] },
  ])("throws NotFoundError when $label", async ({ rows }) => {
    queryMock.mockResolvedValueOnce(pgResult(rows));

    await expect(
      getCustomerItemScoresCustomerResult(fakePool, RUN_ID, "C1"),
    ).rejects.toThrow(NotFoundError);
  });

  it("reads item names only from this customer's own orders", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ items: [] }]));

    await getCustomerItemScoresCustomerResult(fakePool, RUN_ID, "C1").catch(
      () => undefined,
    );

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringMatching(/o->>'customerId'[^\n]*= \$2/),
      [RUN_ID, "C1"],
    );
  });

  it("treats the customer id as an opaque value", async () => {
    const items = [
      { rank: 1, itemId: "X", itemName: "Rice", score: 0.8, nOrders: 2 },
    ];
    queryMock.mockResolvedValueOnce(pgResult([{ items }]));

    const result = await getCustomerItemScoresCustomerResult(
      fakePool,
      RUN_ID,
      "a/b c%",
    );

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      RUN_ID,
      "a/b c%",
    ]);
    expect(result).toStrictEqual({ customerId: "a/b c%", items });
  });
});
