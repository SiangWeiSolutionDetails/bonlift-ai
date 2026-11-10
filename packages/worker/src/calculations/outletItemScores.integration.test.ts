import { closePool, getPool } from "@bonlift-ai/db";
import { afterAll, describe, expect, it } from "vitest";
import { loadRun } from "../runs/runs.repository.js";
import {
  createBrandFixture,
  createOutletFixture,
  createRunFixture,
  order,
  storeOrders,
} from "../testing/fixtures.js";
import { calculateOutletItemScores } from "./outletItemScores.js";

afterAll(async () => {
  await closePool();
});

describe("calculateOutletItemScores (integration)", () => {
  it("stores an all_day list alongside the configured dayparts", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool, {
      dayparts: [{ name: "breakfast", start: "06:00", end: "11:00" }],
    });
    const outletId = await createOutletFixture(pool, brandId);
    await storeOrders(pool, outletId, "2026-11-01", [
      order("B1", "2026-11-01T08:00:00+08:00", ["TOAST"]),
      order("L1", "2026-11-01T13:00:00+08:00", ["NOODLE"]),
    ]);
    const runId = await createRunFixture(pool, {
      brandId,
      outletId,
      jobType: "outlet_item_scores",
      from: "2026-11-01",
      to: "2026-11-01",
    });

    await calculateOutletItemScores(pool, (await loadRun(pool, runId))!);

    const result = await pool.query(
      `
      SELECT daypart, external_item_id
      FROM outlet_item_scores
      WHERE run_id = $1
      ORDER BY daypart, rank, external_item_id;
      `,
      [runId],
    );
    expect(result.rows).toEqual([
      { daypart: "all_day", external_item_id: "NOODLE" },
      { daypart: "all_day", external_item_id: "TOAST" },
      { daypart: "breakfast", external_item_id: "TOAST" },
    ]);
  });

  it("ranks addons separately from mains, over the same orders", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool);
    const outletId = await createOutletFixture(pool, brandId);
    await storeOrders(pool, outletId, "2026-11-01", [
      { orderId: "O1", orderedAt: "2026-11-01T12:00:00+08:00", lines: [{ itemId: "NASI", addons: ["EGG", "SAMBAL"] }] },
      { orderId: "O2", orderedAt: "2026-11-01T12:10:00+08:00", lines: [{ itemId: "NASI", addons: ["EGG"] }] },
      order("O3", "2026-11-01T12:20:00+08:00", ["EGG", "TEH"]),
    ]);
    const runId = await createRunFixture(pool, {
      brandId,
      outletId,
      jobType: "outlet_item_scores",
      from: "2026-11-01",
      to: "2026-11-01",
    });

    await calculateOutletItemScores(pool, (await loadRun(pool, runId))!);

    const result = await pool.query(
      `
      SELECT item_role, rank, external_item_id, round(score, 4)::float8 AS score, n_orders
      FROM outlet_item_scores
      WHERE run_id = $1
      ORDER BY item_role, rank;
      `,
      [runId],
    );
    expect(result.rows).toEqual([
      { item_role: "addon", rank: 1, external_item_id: "EGG", score: 0.6667, n_orders: 2 },
      { item_role: "addon", rank: 2, external_item_id: "SAMBAL", score: 0.3333, n_orders: 1 },
      { item_role: "main", rank: 1, external_item_id: "NASI", score: 0.6667, n_orders: 2 },
      { item_role: "main", rank: 2, external_item_id: "EGG", score: 0.3333, n_orders: 1 },
      { item_role: "main", rank: 3, external_item_id: "TEH", score: 0.3333, n_orders: 1 },
    ]);
  });
});
