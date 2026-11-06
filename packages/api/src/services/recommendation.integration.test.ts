import { beforeEach, describe, expect, it } from "vitest";
import { getTestPool } from "../testing/testDb.js";
import { createBrand } from "./brand.service.js";
import { createOutlet } from "./outlet.service.js";
import { createOutletItemScoresCalculationConfigVersion } from "./outletItemScoresCalculationConfigVersion.service.js";
import { getRecommendations } from "./recommendation.service.js";
import { createTenant } from "./tenant.service.js";

const silentLog = { error: () => undefined, warn: () => undefined };

let brandId: string;
let outletId: string;

// A succeeded run on the brand's latest config version, published the way the worker publishes it.
async function publishRun(
  jobType: "outlet_item_scores" | "customer_item_scores" | "item_affinity",
): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH run AS (
      INSERT INTO computation_runs (
        brand_id, outlet_id, job_type, run_date, algorithm_version, calculation_config_version_id,
        input_window_from, input_window_to, trigger_type, triggered_by, status, row_count
      )
      SELECT $1, CASE WHEN $3 = 'outlet_item_scores' THEN $2::uuid END, $3, current_date, 'test', v.id,
             '2026-11-01', '2026-11-01', 'manual', 'test', 'succeeded', 1
      FROM calculation_config_versions v
      WHERE v.brand_id = $1
        AND v.job_type = $3
      ORDER BY v.version DESC
      LIMIT 1
      RETURNING id, brand_id, outlet_id, job_type
    ),
    outlet_published AS (
      INSERT INTO published_runs (outlet_id, job_type, run_id)
      SELECT outlet_id, job_type, id FROM run WHERE outlet_id IS NOT NULL
    ),
    brand_published AS (
      INSERT INTO brand_published_runs (brand_id, job_type, run_id)
      SELECT brand_id, job_type, id FROM run WHERE outlet_id IS NULL
    )
    SELECT id FROM run;
    `,
    [brandId, outletId, jobType],
  );
  return result.rows[0].id;
}

async function storeOutletScores(runId: string, rows: [daypart: string, itemId: string, rank: number][]) {
  for (const [daypart, itemId, rank] of rows) {
    await getTestPool().query(
      `
      INSERT INTO outlet_item_scores (run_id, run_date, brand_id, outlet_id, external_item_id, daypart, score, n_orders, rank)
      VALUES ($1, current_date, $2, $3, $4, $5, 0.5, 5, $6);
      `,
      [runId, brandId, outletId, itemId, daypart, rank],
    );
  }
}

async function storeFavourites(runId: string, rows: [daypart: string, itemId: string, rank: number][]) {
  for (const [daypart, itemId, rank] of rows) {
    await getTestPool().query(
      `
      INSERT INTO customer_item_scores (run_id, run_date, brand_id, customer_external_id, daypart, external_item_id, score, n_orders, rank)
      VALUES ($1, current_date, $2, 'C1', $3, $4, 0.9, 3, $5);
      `,
      [runId, brandId, daypart, itemId, rank],
    );
  }
}

async function storeAffinity(runId: string, rows: [itemA: string, itemB: string, confidence: number][]) {
  for (const [itemA, itemB, confidence] of rows) {
    await getTestPool().query(
      `
      INSERT INTO item_affinity_scores (run_id, run_date, brand_id, item_a, item_b, n_pair, n_item_a, confidence, lift, rank)
      VALUES ($1, current_date, $2, $3, $4, 10, 20, $5, 2, 1);
      `,
      [runId, brandId, itemA, itemB, confidence],
    );
  }
}

async function recommendedItemIds(daypart?: string): Promise<string[]> {
  const response = await getRecommendations(getTestPool(), silentLog, brandId, {
    outletId,
    cart: [],
    customerId: "C1",
    daypart,
    limit: 10,
  });
  return response.items.map((item) => item.itemId);
}

beforeEach(async () => {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  brandId = (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
  outletId = (await createOutlet(pool, { brandId, name: "Boat Quay" })).id;
  await createOutletItemScoresCalculationConfigVersion(
    pool,
    brandId,
    {
      dayparts: [
        { name: "breakfast", start: "06:00", end: "11:00" },
        { name: "dinner", start: "17:00", end: "22:00" },
      ],
    },
    "test",
  );

  const outletRunId = await publishRun("outlet_item_scores");
  await storeOutletScores(outletRunId, [
    ["breakfast", "TOAST", 1],
    ["dinner", "RICE", 1],
    ["all_day", "TOAST", 1],
    ["all_day", "RICE", 2],
  ]);
  const customerRunId = await publishRun("customer_item_scores");
  await storeFavourites(customerRunId, [
    ["breakfast", "KAYA", 1],
    ["all_day", "KAYA", 1],
  ]);
});

describe("getRecommendations (integration)", () => {
  it("does not serve a breakfast favourite at dinner", async () => {
    expect(await recommendedItemIds("dinner")).toEqual(["RICE"]);
  });

  it("serves the requested daypart's favourites first", async () => {
    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "TOAST"]);
  });

  it("serves the all_day lists when no daypart is sent", async () => {
    expect(await recommendedItemIds(undefined)).toEqual(["KAYA", "TOAST", "RICE"]);
  });

  it("returns no items for a daypart the brand has not configured", async () => {
    const response = await getRecommendations(getTestPool(), silentLog, brandId, {
      outletId,
      cart: [],
      customerId: "C1",
      daypart: "supper",
      limit: 10,
    });

    expect(response.items).toEqual([]);
    expect(response.daypart).toBe("supper");
  });

  describe("with items that go with the cart", () => {
    let affinityRunId: string;

    beforeEach(async () => {
      affinityRunId = await publishRun("item_affinity");
      await storeAffinity(affinityRunId, [
        ["BURGER", "FRIES", 0.6],
        ["BURGER", "COLA", 0.5],
        ["BURGER", "KAYA", 0.9],
        ["RICE", "COLA", 0.3],
        ["RICE", "BURGER", 0.4],
      ]);
    });

    function recommendWithCart(cart: string[], daypart: string, include?: string[]) {
      return getRecommendations(getTestPool(), silentLog, brandId, {
        outletId,
        cart: cart.map((itemId) => ({ itemId, qty: 1 })),
        daypart,
        include,
        limit: 10,
      });
    }

    it("ranks partners by their confidence summed over the whole cart, never returning cart items", async () => {
      const response = await recommendWithCart(["BURGER", "RICE"], "dinner");

      expect(response.affinityRunId).toBe(affinityRunId);
      expect(response.items).toEqual([
        { itemId: "KAYA", rank: 1, reason: "goes_with_cart" },
        { itemId: "COLA", rank: 2, reason: "goes_with_cart" },
        { itemId: "FRIES", rank: 3, reason: "goes_with_cart" },
      ]);
    });

    it("keeps a favourite that goes with the cart ahead of the other partners", async () => {
      const response = await getRecommendations(getTestPool(), silentLog, brandId, {
        outletId,
        cart: [{ itemId: "BURGER", qty: 1 }],
        customerId: "C1",
        daypart: "breakfast",
        limit: 10,
      });

      expect(response.items).toEqual([
        { itemId: "KAYA", rank: 1, reason: "frequently_ordered" },
        { itemId: "FRIES", rank: 2, reason: "goes_with_cart" },
        { itemId: "COLA", rank: 3, reason: "goes_with_cart" },
        { itemId: "TOAST", rank: 4, reason: "popular_at_outlet" },
      ]);
    });

    it("only returns included partners", async () => {
      const response = await recommendWithCart(["BURGER"], "dinner", ["FRIES", "RICE"]);

      expect(response.items.map((item) => item.itemId)).toEqual(["FRIES", "RICE"]);
    });

    it("returns no partners for a daypart the brand has not configured", async () => {
      const response = await recommendWithCart(["BURGER"], "supper");

      expect(response.items).toEqual([]);
    });
  });
});
