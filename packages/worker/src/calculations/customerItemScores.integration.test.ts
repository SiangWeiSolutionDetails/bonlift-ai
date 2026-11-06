import { closePool, getPool } from "@bonlift-ai/db";
import { afterAll, describe, expect, it } from "vitest";
import { loadRun } from "../runs/runs.repository.js";
import {
  addCustomerConfigVersion,
  addOutletConfigVersion,
  createBrandFixture,
  createOutletFixture,
  createRunFixture,
  order,
  storeOrders,
} from "../testing/fixtures.js";
import { calculateCustomerItemScores } from "./customerItemScores.js";

const DAYPARTS = [
  { name: "breakfast", start: "06:00", end: "11:00" },
  { name: "dinner", start: "17:00", end: "22:00" },
];

afterAll(async () => {
  await closePool();
});

async function calculate(brandId: string, from: string, to: string) {
  const pool = getPool();
  const runId = await createRunFixture(pool, { brandId, jobType: "customer_item_scores", from, to });
  return calculateRun(runId);
}

async function calculateRun(runId: string) {
  const pool = getPool();
  const run = await loadRun(pool, runId);
  await calculateCustomerItemScores(pool, run!);
  return runId;
}

async function scoresByDaypart(runId: string, customerId: string) {
  const result = await getPool().query(
    `
    SELECT daypart, external_item_id, n_orders
    FROM customer_item_scores
    WHERE run_id = $1
      AND customer_external_id = $2
    ORDER BY daypart, rank;
    `,
    [runId, customerId],
  );
  const lists: Record<string, Record<string, number>> = {};
  for (const row of result.rows) {
    lists[row.daypart] ??= {};
    lists[row.daypart][row.external_item_id] = row.n_orders;
  }
  return lists;
}

describe("calculateCustomerItemScores (integration)", () => {
  it("stores a list per daypart plus an all_day list", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool, { dayparts: DAYPARTS });
    const outletId = await createOutletFixture(pool, brandId);
    await storeOrders(pool, outletId, "2026-11-01", [
      order("B1", "2026-11-01T08:00:00+08:00", ["TOAST"], "C1"),
      order("B2", "2026-11-01T09:00:00+08:00", ["TOAST", "KOPI"], "C1"),
      order("D1", "2026-11-01T18:00:00+08:00", ["RICE"], "C1"),
      order("D2", "2026-11-01T19:00:00+08:00", ["RICE", "TEH"], "C1"),
      order("L1", "2026-11-01T13:00:00+08:00", ["NOODLE"], "C1"),
    ]);

    const runId = await calculate(brandId, "2026-11-01", "2026-11-01");

    expect(await scoresByDaypart(runId, "C1")).toEqual({
      breakfast: { TOAST: 2, KOPI: 1 },
      dinner: { RICE: 2, TEH: 1 },
      // The 13:00 order is outside every daypart, so it only counts towards all_day
      all_day: { TOAST: 2, KOPI: 1, RICE: 2, TEH: 1, NOODLE: 1 },
    });
  });

  it("uses the dayparts that were latest when the run was created", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool, { dayparts: DAYPARTS });
    const outletId = await createOutletFixture(pool, brandId);
    await storeOrders(pool, outletId, "2026-11-01", [
      order("B1", "2026-11-01T08:00:00+08:00", ["TOAST"], "C1"),
    ]);
    const runId = await createRunFixture(pool, {
      brandId,
      jobType: "customer_item_scores",
      from: "2026-11-01",
      to: "2026-11-01",
    });

    await addOutletConfigVersion(pool, brandId, [{ name: "morning", start: "05:00", end: "12:00" }]);
    await calculateRun(runId);

    expect(Object.keys(await scoresByDaypart(runId, "C1")).sort()).toEqual(["all_day", "breakfast"]);
  });

  it("scores only the latest orders in each daypart when a limit is set", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool, { dayparts: DAYPARTS });
    await addCustomerConfigVersion(pool, brandId, 2);
    const outletId = await createOutletFixture(pool, brandId);
    await storeOrders(pool, outletId, "2026-11-01", [
      order("B1", "2026-11-01T08:00:00+08:00", ["OLD"], "C1"),
      order("D1", "2026-11-01T18:00:00+08:00", ["RICE"], "C1"),
    ]);
    await storeOrders(pool, outletId, "2026-11-02", [
      order("B2", "2026-11-02T08:00:00+08:00", ["MID"], "C1"),
    ]);
    await storeOrders(pool, outletId, "2026-11-03", [
      order("B3", "2026-11-03T08:00:00+08:00", ["NEW"], "C1"),
    ]);

    const runId = await calculate(brandId, "2026-11-01", "2026-11-03");

    expect(await scoresByDaypart(runId, "C1")).toEqual({
      breakfast: { NEW: 1, MID: 1 },
      // Dinner has its own latest orders: the breakfast orders don't push RICE out
      dinner: { RICE: 1 },
      all_day: { NEW: 1, MID: 1 },
    });
  });

  it("scores every order in the window when the limit is NULL", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool, { dayparts: DAYPARTS });
    await addCustomerConfigVersion(pool, brandId, null);
    const outletId = await createOutletFixture(pool, brandId);
    await storeOrders(pool, outletId, "2026-11-01", [
      order("B1", "2026-11-01T08:00:00+08:00", ["OLD"], "C1"),
    ]);
    await storeOrders(pool, outletId, "2026-11-02", [
      order("B2", "2026-11-02T08:00:00+08:00", ["MID"], "C1"),
    ]);
    await storeOrders(pool, outletId, "2026-11-03", [
      order("B3", "2026-11-03T08:00:00+08:00", ["NEW"], "C1"),
    ]);

    const runId = await calculate(brandId, "2026-11-01", "2026-11-03");

    expect((await scoresByDaypart(runId, "C1")).breakfast).toEqual({ NEW: 1, MID: 1, OLD: 1 });
  });
});
