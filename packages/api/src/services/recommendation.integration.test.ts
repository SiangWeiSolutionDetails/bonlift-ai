import { beforeEach, describe, expect, it } from "vitest";
import { readCustomerIdSecret } from "../config/env.js";
import { getTestPool } from "../testing/testDb.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { createBrand } from "./brand.service.js";
import { createOutlet } from "./outlet.service.js";
import { createOutletItemScoresCalculationConfigVersion } from "./outletItemScoresCalculationConfigVersion.service.js";
import { getRecommendations } from "./recommendation.service.js";
import { createServingConfigVersion } from "./servingConfigVersion.service.js";
import { createTenant } from "./tenant.service.js";

const silentLog = { error: () => undefined, warn: () => undefined };

const SECRET = readCustomerIdSecret();
// Stored ids are hashed, so the scores hold the hash and requests send the plain mobile number.
const CUSTOMER_ID = "6591234567";
const CUSTOMER_HASH = hashCustomerId(SECRET, CUSTOMER_ID);

function recommend(pool: Parameters<typeof getRecommendations>[0], log: typeof silentLog, brand: string,
  request: Parameters<typeof getRecommendations>[3]) {
  return getRecommendations(pool, log, brand, request, SECRET);
}

let brandId: string;
let outletId: string;
let outletRunId: string;

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
      VALUES ($1, current_date, $2, $6, $3, $4, 0.9, 3, $5);
      `,
      [runId, brandId, daypart, itemId, rank, CUSTOMER_HASH],
    );
  }
}

async function storeAffinity(
  runId: string,
  rows: [itemA: string, itemB: string, confidence: number, lift?: number, nItemA?: number][],
) {
  for (const [itemA, itemB, confidence, lift = 2, nItemA = 20] of rows) {
    await getTestPool().query(
      `
      INSERT INTO item_affinity_scores (run_id, run_date, brand_id, item_a, item_b, n_pair, n_item_a, confidence, lift, rank)
      VALUES ($1, current_date, $2, $3, $4, 10, $7, $5, $6, 1);
      `,
      [runId, brandId, itemA, itemB, confidence, lift, nItemA],
    );
  }
}

async function recommendedItemIds(daypart?: string): Promise<string[]> {
  const response = await recommend(getTestPool(), silentLog, brandId, {
    outletId,
    cart: [],
    customerId: CUSTOMER_ID,
    daypart,
    limit: 10,
  });
  return response.items.map((item) => item.itemId);
}

async function servedItemsById(request: Partial<Parameters<typeof getRecommendations>[3]>) {
  const response = await recommend(getTestPool(), silentLog, brandId, {
    outletId,
    cart: [],
    limit: 10,
    ...request,
  });
  return Object.fromEntries(response.items.map((item) => [item.itemId, item]));
}

function cartOf(...itemIds: string[]) {
  return itemIds.map((itemId) => ({ itemId, qty: 1 }));
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

  outletRunId = await publishRun("outlet_item_scores");
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

  describe("serving config", () => {
    it("drops a favourite below a raised minimum of orders", async () => {
      expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "TOAST"]);

      await createServingConfigVersion(getTestPool(), brandId, { minFavouriteOrders: 4 }, "test");

      expect(await recommendedItemIds("breakfast")).toEqual(["TOAST"]);
    });

    it("marks best sellers from the latest config version", async () => {
      expect((await servedItemsById({ daypart: "dinner" })).RICE.detail).toBeUndefined();

      await createServingConfigVersion(
        getTestPool(),
        brandId,
        { bestSellerMaxRank: 1, bestSellerMinListSize: 1 },
        "test",
      );

      const items = await servedItemsById({ daypart: "dinner" });

      expect(items.RICE.detail).toStrictEqual({ bestSeller: true });
    });

    it("serves an empty list for a brand with no serving config", async () => {
      const pool = getTestPool();
      const tenant = await createTenant(pool, { name: "Bare Foods" });
      const bare = await pool.query("INSERT INTO brands (tenant_id, name) VALUES ($1, 'Bare') RETURNING id", [
        tenant.id,
      ]);
      const bareBrandId = bare.rows[0].id;
      const bareOutlet = await createOutlet(pool, { brandId: bareBrandId, name: "Bare Outlet" });

      const response = await recommend(pool, silentLog, bareBrandId, { outletId: bareOutlet.id, cart: [] });

      expect(response).toStrictEqual({
        runId: null,
        customerRunId: null,
        affinityRunId: null,
        daypart: null,
        items: [],
      });
    });
  });

  it("returns no items for a daypart the brand has not configured", async () => {
    const response = await recommend(getTestPool(), silentLog, brandId, {
      outletId,
      cart: [],
      customerId: CUSTOMER_ID,
      daypart: "supper",
      limit: 10,
    });

    expect(response.items).toEqual([]);
    expect(response.daypart).toBe("supper");
  });

  describe("best sellers", () => {
    beforeEach(async () => {
      await storeOutletScores(
        outletRunId,
        ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"].map((itemId, index) => [
          "dinner",
          itemId,
          index + 2,
        ]),
      );
    });

    it("marks the top 3 of a 10-item list as best sellers", async () => {
      const items = await servedItemsById({ daypart: "dinner" });

      expect(items.RICE.detail).toStrictEqual({ bestSeller: true });
      expect(items.D3.detail).toStrictEqual({ bestSeller: true });
      expect(items.D4).toStrictEqual({ itemId: "D4", rank: 4, reason: "popular_at_outlet" });
    });

    it("counts rank and list size on the stored list when exclude shrinks the served list", async () => {
      const items = await servedItemsById({ daypart: "dinner", exclude: ["RICE"] });

      expect(items.D2).toStrictEqual({
        itemId: "D2",
        rank: 1,
        reason: "popular_at_outlet",
        detail: { bestSeller: true },
      });
      expect(items.D4).toStrictEqual({ itemId: "D4", rank: 3, reason: "popular_at_outlet" });
    });

    it("counts the list size on the stored list when include shrinks the served list", async () => {
      const items = await servedItemsById({ daypart: "dinner", include: ["D3", "D4"] });

      expect(Object.values(items)).toStrictEqual([
        { itemId: "D3", rank: 1, reason: "popular_at_outlet", detail: { bestSeller: true } },
        { itemId: "D4", rank: 2, reason: "popular_at_outlet" },
      ]);
    });
  });

  it("serves favourites ahead of popular items for a non-empty cart when no affinity results exist", async () => {
    const items = await servedItemsById({ cart: cartOf("BURGER"), customerId: CUSTOMER_ID, daypart: "breakfast" });

    expect(Object.values(items)).toStrictEqual([
      { itemId: "KAYA", rank: 1, reason: "frequently_ordered" },
      { itemId: "TOAST", rank: 2, reason: "popular_at_outlet" },
    ]);
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
      return recommend(getTestPool(), silentLog, brandId, {
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
        { itemId: "KAYA", rank: 1, reason: "goes_with_cart", detail: { basedOn: ["BURGER"] } },
        { itemId: "COLA", rank: 2, reason: "goes_with_cart", detail: { basedOn: ["BURGER", "RICE"] } },
        { itemId: "FRIES", rank: 3, reason: "goes_with_cart", detail: { basedOn: ["BURGER"] } },
      ]);
    });

    it("keeps a favourite that goes with the cart ahead of the other partners", async () => {
      const response = await recommend(getTestPool(), silentLog, brandId, {
        outletId,
        cart: [{ itemId: "BURGER", qty: 1 }],
        customerId: CUSTOMER_ID,
        daypart: "breakfast",
        limit: 10,
      });

      expect(response.items).toEqual([
        { itemId: "KAYA", rank: 1, reason: "frequently_ordered", detail: { basedOn: ["BURGER"] } },
        { itemId: "FRIES", rank: 2, reason: "goes_with_cart", detail: { basedOn: ["BURGER"] } },
        { itemId: "COLA", rank: 3, reason: "goes_with_cart", detail: { basedOn: ["BURGER"] } },
        { itemId: "TOAST", rank: 4, reason: "popular_at_outlet" },
      ]);
    });

    it("lists the cart items a partner goes with, strongest pair first", async () => {
      await storeAffinity(affinityRunId, [
        ["TEA", "COLA", 0.8],
        ["APPLE", "FRIES", 0.6, 1.5],
        ["TEA", "FRIES", 0.6, 3],
      ]);

      const items = await servedItemsById({ cart: cartOf("BURGER", "TEA", "APPLE"), daypart: "dinner" });

      expect(items.COLA.detail).toStrictEqual({ basedOn: ["TEA", "BURGER"] });
      expect(items.FRIES.detail).toStrictEqual({ basedOn: ["TEA", "BURGER", "APPLE"] });
    });

    it("describes a partner by its top pair's share and lift once the pair has enough orders", async () => {
      await storeAffinity(affinityRunId, [
        ["TEA", "PIE", 0.666, 2, 50],
        ["TEA", "BUN", 0.7, 1.5, 60],
        ["BURGER", "BUN", 0.3, 4, 100],
        ["TEA", "CAKE", 0.9, 5, 49],
      ]);

      const items = await servedItemsById({ cart: cartOf("TEA", "BURGER"), daypart: "dinner" });

      expect(items.PIE).toStrictEqual({
        itemId: "PIE",
        rank: expect.any(Number),
        reason: "goes_with_cart",
        detail: { basedOn: ["TEA"], pairShare: 0.67, strongPairing: true },
      });
      expect(items.BUN.detail).toStrictEqual({ basedOn: ["TEA", "BURGER"], pairShare: 0.7 });
      expect(items.CAKE.detail).toStrictEqual({ basedOn: ["TEA"] });
    });

    it("rounds the share on the stored value and omits a share below 1 in 10", async () => {
      await storeAffinity(affinityRunId, [
        ["TEA", "JAM", 0.285, 1.5, 200],
        ["TEA", "MUG", 0.04, 2.5, 400],
      ]);

      const items = await servedItemsById({ cart: cartOf("TEA"), daypart: "dinner" });

      expect(items.JAM.detail).toStrictEqual({ basedOn: ["TEA"], pairShare: 0.29 });
      expect(items.MUG.detail).toStrictEqual({ basedOn: ["TEA"], strongPairing: true });
    });

    it("lists at most 3 cart items a partner goes with", async () => {
      await storeAffinity(affinityRunId, [
        ["TEA", "COLA", 0.8],
        ["APPLE", "COLA", 0.7],
        ["PEAR", "COLA", 0.2],
      ]);

      const items = await servedItemsById({ cart: cartOf("BURGER", "TEA", "APPLE", "PEAR"), daypart: "dinner" });

      expect(items.COLA.detail).toStrictEqual({ basedOn: ["TEA", "APPLE", "BURGER"] });
    });

    it("ranks a favourite that does not go with the cart after the partners, ahead of popular items", async () => {
      const items = await servedItemsById({ cart: cartOf("RICE"), customerId: CUSTOMER_ID, daypart: "breakfast" });

      expect(Object.values(items).map(({ itemId, reason }) => [itemId, reason])).toStrictEqual([
        ["BURGER", "goes_with_cart"],
        ["COLA", "goes_with_cart"],
        ["KAYA", "frequently_ordered"],
        ["TOAST", "popular_at_outlet"],
      ]);
      expect(items.KAYA.detail).toBeUndefined();
    });

    it("lists only the cart items a favourite goes with", async () => {
      const items = await servedItemsById({
        cart: cartOf("BURGER", "RICE"),
        customerId: CUSTOMER_ID,
        daypart: "breakfast",
      });

      expect(items.KAYA.detail).toStrictEqual({ basedOn: ["BURGER"] });
    });

    it("gives a favourite no detail when the cart is empty", async () => {
      const items = await servedItemsById({ customerId: CUSTOMER_ID, daypart: "breakfast" });

      expect(items.KAYA).toStrictEqual({ itemId: "KAYA", rank: 1, reason: "frequently_ordered" });
    });

    it("keeps a favourite that is also a strong partner as a favourite, without a share", async () => {
      await storeAffinity(affinityRunId, [["TEA", "KAYA", 0.8, 3, 100]]);

      const items = await servedItemsById({
        cart: cartOf("TEA"),
        customerId: CUSTOMER_ID,
        daypart: "breakfast",
      });

      expect(items.KAYA).toStrictEqual({
        itemId: "KAYA",
        rank: 1,
        reason: "frequently_ordered",
        detail: { basedOn: ["TEA"] },
      });
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
