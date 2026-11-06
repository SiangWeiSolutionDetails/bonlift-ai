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
});
