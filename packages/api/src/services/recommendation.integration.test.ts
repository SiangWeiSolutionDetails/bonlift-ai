import { beforeEach, describe, expect, it } from "vitest";
import { readCustomerIdSecret } from "../config/env.js";
import { getTestPool } from "../testing/testDb.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { createBrand } from "./brand.service.js";
import { createOutlet } from "./outlet.service.js";
import { createOutletItemScoresCalculationConfigVersion } from "./outletItemScoresCalculationConfigVersion.service.js";
import { getRecommendations, recordRecommendationServe } from "./recommendation.service.js";
import { recordRecommendationFeedback } from "./recommendationFeedback.service.js";
import { createServingConfigVersion } from "./servingConfigVersion.service.js";
import { createTenant } from "./tenant.service.js";

const silentLog = { error: () => undefined, warn: () => undefined };

const SECRET = readCustomerIdSecret();
// Stored ids are hashed, so the scores hold the hash and requests send the plain mobile number.
const CUSTOMER_ID = "6591234567";
const CUSTOMER_HASH = hashCustomerId(SECRET, CUSTOMER_ID);

async function recommend(pool: Parameters<typeof getRecommendations>[0], log: typeof silentLog, brand: string,
  request: Parameters<typeof getRecommendations>[3]) {
  return (await getRecommendations(pool, log, brand, request, SECRET)).response;
}

let brandId: string;
let outletId: string;
let outletRunId: string;
let customerRunId: string;

// A succeeded run on the brand's latest config version, published the way the worker publishes it.
async function publishRun(
  jobType: "outlet_item_scores" | "customer_item_scores" | "item_affinity",
  brand = brandId,
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
    [brand, outletId, jobType],
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
  brand = brandId,
) {
  for (const [itemA, itemB, confidence, lift = 2, nItemA = 20] of rows) {
    await getTestPool().query(
      `
      INSERT INTO item_affinity_scores (run_id, run_date, brand_id, item_a, item_b, n_pair, n_item_a, confidence, lift, rank)
      VALUES ($1, current_date, $2, $3, $4, 10, $7, $5, $6, 1);
      `,
      [runId, brand, itemA, itemB, confidence, lift, nItemA],
    );
  }
}

async function recommendedItemIds(
  daypart?: string,
  request: Partial<Parameters<typeof getRecommendations>[3]> = {},
): Promise<string[]> {
  const response = await recommend(getTestPool(), silentLog, brandId, {
    outletId,
    cart: [],
    customerId: CUSTOMER_ID,
    daypart,
    limit: 10,
    ...request,
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
  customerRunId = await publishRun("customer_item_scores");
  await storeFavourites(customerRunId, [
    ["breakfast", "KAYA", 1],
    ["all_day", "KAYA", 1],
  ]);
});

describe("getRecommendations (integration)", () => {
  it("serves only the customer's favourites for the requested daypart", async () => {
    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA"]);
  });

  it("serves the customer's all_day favourites when no daypart is sent", async () => {
    expect(await recommendedItemIds(undefined)).toEqual(["KAYA"]);
  });

  it("serves only popular items to an anonymous customer", async () => {
    expect(await recommendedItemIds("breakfast", { customerId: undefined })).toEqual(["TOAST"]);
    expect(await recommendedItemIds(undefined, { customerId: null })).toEqual(["TOAST", "RICE"]);
  });

  it("falls back to popular items when the customer has no favourites for the daypart", async () => {
    expect(await recommendedItemIds("dinner")).toEqual(["RICE"]);
  });

  it("falls back to popular items for a customer with no scores", async () => {
    expect(await recommendedItemIds("breakfast", { customerId: "6599999999" })).toEqual(["TOAST"]);
  });

  it.each([
    ["in the cart", { cart: [{ itemId: "KAYA", qty: 1 }] }],
    ["excluded", { exclude: ["KAYA"] }],
    ["not included", { include: ["TOAST"] }],
  ])("falls back to popular items when every favourite is %s", async (_name, request) => {
    expect(await recommendedItemIds("breakfast", request)).toEqual(["TOAST"]);
  });

  describe("serving config", () => {
    it("falls back to popular items once a raised minimum of orders drops every favourite", async () => {
      expect(await recommendedItemIds("breakfast")).toEqual(["KAYA"]);

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
        recommendationId: null,
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

  describe("favourites that go with the cart", () => {
    beforeEach(async () => {
      await storeFavourites(customerRunId, [
        ["breakfast", "MILO", 2],
        ["breakfast", "ROTI", 3],
      ]);
    });

    function recommendBreakfast(request: Partial<Parameters<typeof getRecommendations>[3]> = {}) {
      return recommend(getTestPool(), silentLog, brandId, {
        outletId,
        cart: cartOf("BURGER"),
        customerId: CUSTOMER_ID,
        daypart: "breakfast",
        limit: 10,
        ...request,
      });
    }

    it("keeps the stored order without a published affinity run", async () => {
      const response = await recommendBreakfast();

      expect(response.affinityRunId).toBeNull();
      expect(response.items).toStrictEqual([
        { itemId: "KAYA", rank: 1, reason: "frequently_ordered" },
        { itemId: "MILO", rank: 2, reason: "frequently_ordered" },
        { itemId: "ROTI", rank: 3, reason: "frequently_ordered" },
      ]);
    });

    describe("with a published affinity run", () => {
      let affinityRunId: string;

      beforeEach(async () => {
        affinityRunId = await publishRun("item_affinity");
        await storeAffinity(affinityRunId, [
          ["BURGER", "ROTI", 0.6],
          ["COLA", "MILO", 0.5],
        ]);
      });

      it("moves a paired favourite above better-ranked unpaired ones, listing the cart item it goes with", async () => {
        expect(await recommendBreakfast()).toStrictEqual({
          recommendationId: expect.any(String),
          runId: outletRunId,
          customerRunId,
          affinityRunId,
          daypart: "breakfast",
          items: [
            { itemId: "ROTI", rank: 1, reason: "frequently_ordered", detail: { basedOn: ["BURGER"] } },
            { itemId: "KAYA", rank: 2, reason: "frequently_ordered" },
            { itemId: "MILO", rank: 3, reason: "frequently_ordered" },
          ],
        });
      });

      it("keeps paired favourites in stored order, followed by the unpaired ones", async () => {
        const response = await recommendBreakfast({ cart: cartOf("BURGER", "COLA") });

        expect(response.items).toStrictEqual([
          { itemId: "MILO", rank: 1, reason: "frequently_ordered", detail: { basedOn: ["COLA"] } },
          { itemId: "ROTI", rank: 2, reason: "frequently_ordered", detail: { basedOn: ["BURGER"] } },
          { itemId: "KAYA", rank: 3, reason: "frequently_ordered" },
        ]);
      });

      it("keeps the stored order for an empty cart", async () => {
        const response = await recommendBreakfast({ cart: [] });

        expect(response.affinityRunId).toBe(affinityRunId);
        expect(response.items).toStrictEqual([
          { itemId: "KAYA", rank: 1, reason: "frequently_ordered" },
          { itemId: "MILO", rank: 2, reason: "frequently_ordered" },
          { itemId: "ROTI", rank: 3, reason: "frequently_ordered" },
        ]);
      });

      it("lists at most 3 cart items a favourite goes with, strongest pair first", async () => {
        await storeAffinity(affinityRunId, [
          ["TEA", "ROTI", 0.8],
          ["APPLE", "ROTI", 0.7],
          ["PEAR", "ROTI", 0.2],
        ]);

        const items = await servedItemsById({
          cart: cartOf("BURGER", "TEA", "APPLE", "PEAR"),
          customerId: CUSTOMER_ID,
          daypart: "breakfast",
        });

        expect(items.ROTI.detail).toStrictEqual({ basedOn: ["TEA", "APPLE", "BURGER"] });
      });

      it("applies the limit after putting paired favourites first", async () => {
        const response = await recommendBreakfast({ limit: 1 });

        expect(response.items).toStrictEqual([
          { itemId: "ROTI", rank: 1, reason: "frequently_ordered", detail: { basedOn: ["BURGER"] } },
        ]);
      });

      it("serves popular items to an anonymous customer in stored order, without basedOn", async () => {
        await storeAffinity(affinityRunId, [["BURGER", "RICE", 0.9]]);

        const response = await recommendBreakfast({ customerId: undefined, daypart: undefined });

        expect(response.affinityRunId).toBe(affinityRunId);
        expect(response.items).toStrictEqual([
          { itemId: "TOAST", rank: 1, reason: "popular_at_outlet" },
          { itemId: "RICE", rank: 2, reason: "popular_at_outlet" },
        ]);
      });
    });
  });
});

describe("items the customer rejected (integration)", () => {
  const OTHER_CUSTOMER_ID = "6599999999";

  async function reject(itemId: string, daysAgo: number, customerId = CUSTOMER_ID) {
    await getTestPool().query(
      `
      INSERT INTO customer_item_rejections (brand_id, customer_external_id, external_item_id, rejected_at)
      VALUES ($1, $2, $3, now() - make_interval(days => $4))
      `,
      [brandId, hashCustomerId(SECRET, customerId), itemId, daysAgo],
    );
  }

  it("does not serve a favourite the customer rejected within the window", async () => {
    await reject("KAYA", 29);

    expect(await recommendedItemIds("breakfast")).toEqual(["TOAST"]);
  });

  it("does not serve a popular item the customer rejected within the window", async () => {
    await reject("TOAST", 1, OTHER_CUSTOMER_ID);

    expect(await recommendedItemIds(undefined, { customerId: OTHER_CUSTOMER_ID })).toEqual(["RICE"]);
  });

  it("serves a rejected item again once the window has passed", async () => {
    await reject("KAYA", 31);

    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA"]);
  });

  it("suppresses nothing with a window of 0 days", async () => {
    await reject("KAYA", 0);
    await createServingConfigVersion(getTestPool(), brandId, { rejectionSuppressionDays: 0 }, "test");

    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA"]);
  });

  it("suppresses an older rejection again after the window is lengthened", async () => {
    await reject("KAYA", 40);
    await createServingConfigVersion(getTestPool(), brandId, { rejectionSuppressionDays: 60 }, "test");

    expect(await recommendedItemIds("breakfast")).toEqual(["TOAST"]);
  });

  it("leaves other customers and anonymous requests unaffected", async () => {
    await reject("TOAST", 1);

    expect(await recommendedItemIds(undefined, { customerId: OTHER_CUSTOMER_ID })).toEqual(["TOAST", "RICE"]);
    expect(await recommendedItemIds(undefined, { customerId: undefined })).toEqual(["TOAST", "RICE"]);
  });

  it("stops serving an item once the customer rejects it from a recorded serve", async () => {
    const pool = getTestPool();
    const { response, serve } = await getRecommendations(
      pool,
      silentLog,
      brandId,
      { outletId, cart: [], customerId: CUSTOMER_ID, daypart: "breakfast" },
      SECRET,
    );
    await recordRecommendationServe(pool, serve!, null);

    await recordRecommendationFeedback(
      pool,
      brandId,
      response.recommendationId!,
      { itemId: "KAYA", type: "rejected", customerId: CUSTOMER_ID },
      SECRET,
    );

    const stored = await pool.query(
      "SELECT item_ids, reasons, rejected_item_ids FROM recommendation_serves WHERE id = $1",
      [response.recommendationId],
    );
    expect(stored.rows).toStrictEqual([
      {
        item_ids: ["KAYA"],
        reasons: ["frequently_ordered"],
        rejected_item_ids: ["KAYA"],
      },
    ]);
    expect(await recommendedItemIds("breakfast")).toEqual(["TOAST"]);
  });
});

type ServeRequest = Partial<Parameters<typeof getRecommendations>[3]>;

// Serves and records the serve the way the route's onResponse hook does.
async function serveAndRecord(request: ServeRequest = {}) {
  const pool = getTestPool();
  const served = await getRecommendations(
    pool,
    silentLog,
    brandId,
    { outletId, cart: [], customerId: CUSTOMER_ID, daypart: "breakfast", limit: 10, ...request },
    SECRET,
  );
  if (served.serve) {
    await recordRecommendationServe(pool, served.serve, null);
  }
  return served;
}

async function exposedItemIds(brand = brandId): Promise<string[]> {
  const result = await getTestPool().query(
    `
    SELECT external_item_id
    FROM customer_item_exposures
    WHERE brand_id = $1
      AND customer_external_id = $2
    ORDER BY external_item_id
    `,
    [brand, CUSTOMER_HASH],
  );
  return result.rows.map((row) => row.external_item_id);
}

// A showing only moves an item down once the feedback window (2 hours by default) has closed.
async function closeFeedbackWindow(age = "2 hours 1 minute"): Promise<void> {
  await getTestPool().query("UPDATE customer_item_exposures SET last_shown_at = now() - $1::interval", [age]);
}

async function createOtherBrand(): Promise<string> {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Other Foods" });
  return (await createBrand(pool, { tenantId: tenant.id, name: "Other House" })).id;
}

describe("items shown before (integration)", () => {
  const OTHER_CUSTOMER_ID = "6599999999";

  beforeEach(async () => {
    await storeFavourites(customerRunId, [["breakfast", "MILO", 2]]);
  });

  it("moves a favourite shown and not accepted below the others on the next serve", async () => {
    expect((await serveAndRecord({ limit: 1 })).response.items.map((item) => item.itemId)).toEqual(["KAYA"]);
    await closeFeedbackWindow();

    expect(await recommendedItemIds("breakfast")).toEqual(["MILO", "KAYA"]);
    expect(await recommendedItemIds("breakfast", { limit: 1 })).toEqual(["MILO"]);
  });

  it("puts every shown favourite back in stored order once all were shown", async () => {
    await serveAndRecord();
    await closeFeedbackWindow();

    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "MILO"]);
  });

  it("serves an accepted favourite first again", async () => {
    const { response } = await serveAndRecord({ limit: 1 });
    await closeFeedbackWindow();

    await recordRecommendationFeedback(
      getTestPool(),
      brandId,
      response.recommendationId!,
      { itemId: "KAYA", type: "accepted", customerId: CUSTOMER_ID },
      SECRET,
    );

    expect(await exposedItemIds()).toEqual([]);
    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "MILO"]);
  });

  it("keeps a shown item moved down when the customer accepts another one", async () => {
    const { response } = await serveAndRecord();

    await recordRecommendationFeedback(
      getTestPool(),
      brandId,
      response.recommendationId!,
      { itemId: "MILO", type: "accepted", customerId: CUSTOMER_ID },
      SECRET,
    );

    expect(await exposedItemIds()).toEqual(["KAYA"]);
    await closeFeedbackWindow();
    expect(await recommendedItemIds("breakfast")).toEqual(["MILO", "KAYA"]);
  });

  it("keeps an item shown within the feedback window in place, so the list is stable within a visit", async () => {
    await serveAndRecord({ limit: 1 });
    await closeFeedbackWindow("1 hour 59 minutes");

    expect(await exposedItemIds()).toEqual(["KAYA"]);
    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "MILO"]);
  });

  it("uses the brand's latest feedback window", async () => {
    await createServingConfigVersion(getTestPool(), brandId, { feedbackWindowMinutes: 30 }, "test");
    await serveAndRecord({ limit: 1 });

    await closeFeedbackWindow("29 minutes");
    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "MILO"]);

    await closeFeedbackWindow("31 minutes");
    expect(await recommendedItemIds("breakfast")).toEqual(["MILO", "KAYA"]);
  });

  it("serves the stored order again once the cooldown has passed", async () => {
    await serveAndRecord({ limit: 1 });
    await getTestPool().query("UPDATE customer_item_exposures SET last_shown_at = now() - interval '25 hours'");

    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "MILO"]);
  });

  it("moves nothing with a cooldown of 0 hours", async () => {
    await createServingConfigVersion(getTestPool(), brandId, { repeatCooldownHours: 0 }, "test");

    await serveAndRecord({ limit: 1 });
    await closeFeedbackWindow();

    expect(await exposedItemIds()).toEqual(["KAYA"]);
    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "MILO"]);
  });

  it("puts a favourite not shown recently above one that goes with the cart", async () => {
    const affinityRunId = await publishRun("item_affinity");
    await storeAffinity(affinityRunId, [["BURGER", "MILO", 0.6]]);
    const request = { cart: cartOf("BURGER"), daypart: "breakfast" };
    expect(await recommendedItemIds("breakfast", request)).toEqual(["MILO", "KAYA"]);

    await serveAndRecord({ ...request, limit: 1 });
    await closeFeedbackWindow();

    expect(await recommendedItemIds("breakfast", request)).toEqual(["KAYA", "MILO"]);
  });

  it("moves a popular item shown to an identified customer below the others", async () => {
    await serveAndRecord({ customerId: OTHER_CUSTOMER_ID, daypart: undefined, limit: 1 });
    await closeFeedbackWindow();

    expect(await recommendedItemIds(undefined, { customerId: OTHER_CUSTOMER_ID })).toEqual(["RICE", "TOAST"]);
  });

  it("records nothing for an anonymous request and never rotates one", async () => {
    await serveAndRecord({ customerId: OTHER_CUSTOMER_ID, daypart: undefined, limit: 1 });
    await closeFeedbackWindow();

    const anonymous = await serveAndRecord({ customerId: undefined, daypart: undefined, limit: 1 });

    expect(anonymous.serve).toBeNull();
    expect(anonymous.response.items.map((item) => item.itemId)).toEqual(["TOAST"]);
    expect(await recommendedItemIds(undefined, { customerId: undefined })).toEqual(["TOAST", "RICE"]);
    const count = await getTestPool().query("SELECT count(*)::int AS n FROM customer_item_exposures");
    expect(count.rows[0].n).toBe(1);
  });

  it("leaves other customers unaffected", async () => {
    await serveAndRecord({ customerId: OTHER_CUSTOMER_ID, daypart: undefined, limit: 1 });
    await closeFeedbackWindow();

    expect(await recommendedItemIds(undefined, { customerId: "6598765432" })).toEqual(["TOAST", "RICE"]);
  });

  it("ignores items shown to the same customer by another brand", async () => {
    const otherBrandId = await createOtherBrand();
    await getTestPool().query(
      "INSERT INTO customer_item_exposures (brand_id, customer_external_id, external_item_id) VALUES ($1, $2, 'KAYA')",
      [otherBrandId, CUSTOMER_HASH],
    );
    await closeFeedbackWindow();

    expect(await recommendedItemIds("breakfast")).toEqual(["KAYA", "MILO"]);
  });
});

describe("recordRecommendationServe (integration)", () => {
  beforeEach(async () => {
    await storeFavourites(customerRunId, [["breakfast", "MILO", 2]]);
  });

  it("records when the customer was shown every served item, keeping no customer id on the serve", async () => {
    const { response } = await serveAndRecord();

    expect(await exposedItemIds()).toEqual(["KAYA", "MILO"]);
    const stored = await getTestPool().query(
      "SELECT row_to_json(s)::text AS row FROM recommendation_serves s WHERE id = $1",
      [response.recommendationId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].row).not.toContain(CUSTOMER_HASH);
    expect(stored.rows[0].row).not.toContain(CUSTOMER_ID);
  });

  it("moves the time an item was last shown forward when it is shown again", async () => {
    await serveAndRecord({ limit: 1 });
    await getTestPool().query("UPDATE customer_item_exposures SET last_shown_at = now() - interval '10 days'");

    await serveAndRecord({ limit: 1 });

    const result = await getTestPool().query(
      "SELECT external_item_id, last_shown_at > now() - interval '1 minute' AS recent FROM customer_item_exposures",
    );
    expect(result.rows).toStrictEqual([{ external_item_id: "KAYA", recent: true }]);
  });
});

describe("items related to the customer's favourites (integration)", () => {
  let affinityRunId: string;

  beforeEach(async () => {
    await storeFavourites(customerRunId, [["breakfast", "MILO", 2]]);
    affinityRunId = await publishRun("item_affinity");
    await storeAffinity(affinityRunId, [
      ["KAYA", "TEA", 0.6],
      ["MILO", "TEA", 0.4],
      ["KAYA", "MILO", 0.9],
      ["MILO", "ROTI", 0.5],
      ["KAYA", "EGG", 0.3],
    ]);
  });

  async function servedItems(request: ServeRequest = {}) {
    const response = await recommend(getTestPool(), silentLog, brandId, {
      outletId,
      cart: [],
      customerId: CUSTOMER_ID,
      daypart: "breakfast",
      limit: 10,
      ...request,
    });
    return response.items;
  }

  it("serves related items after the favourites, strongest first, with the favourites they go with", async () => {
    expect(await servedItems()).toStrictEqual([
      { itemId: "KAYA", rank: 1, reason: "frequently_ordered" },
      { itemId: "MILO", rank: 2, reason: "frequently_ordered" },
      { itemId: "TEA", rank: 3, reason: "related_to_favourite", detail: { basedOn: ["KAYA", "MILO"] } },
      { itemId: "ROTI", rank: 4, reason: "related_to_favourite", detail: { basedOn: ["MILO"] } },
      { itemId: "EGG", rank: 5, reason: "related_to_favourite", detail: { basedOn: ["KAYA"] } },
    ]);
  });

  it("orders related items with the same confidence by lift", async () => {
    await storeAffinity(affinityRunId, [["KAYA", "BUN", 0.6, 3]]);

    expect((await servedItems()).map((item) => item.itemId)).toEqual(["KAYA", "MILO", "BUN", "TEA", "ROTI", "EGG"]);
  });

  it("never relates a favourite, even one removed from the response", async () => {
    expect((await servedItems({ exclude: ["MILO"] })).map((item) => [item.itemId, item.reason])).toEqual([
      ["KAYA", "frequently_ordered"],
      ["TEA", "related_to_favourite"],
      ["ROTI", "related_to_favourite"],
      ["EGG", "related_to_favourite"],
    ]);
  });

  it.each([
    ["in the cart", { cart: cartOf("TEA") }],
    ["excluded", { exclude: ["TEA"] }],
    ["not included", { include: ["KAYA", "MILO", "ROTI", "EGG"] }],
  ])("never serves a related item %s", async (_name, request) => {
    expect((await servedItems(request)).map((item) => item.itemId)).toEqual(["KAYA", "MILO", "ROTI", "EGG"]);
  });

  it("never serves a related item the customer rejected", async () => {
    await getTestPool().query(
      "INSERT INTO customer_item_rejections (brand_id, customer_external_id, external_item_id) VALUES ($1, $2, 'TEA')",
      [brandId, CUSTOMER_HASH],
    );

    expect((await servedItems()).map((item) => item.itemId)).toEqual(["KAYA", "MILO", "ROTI", "EGG"]);
  });

  it("finds no related items through a favourite the customer rejected", async () => {
    await getTestPool().query(
      "INSERT INTO customer_item_rejections (brand_id, customer_external_id, external_item_id) VALUES ($1, $2, 'KAYA')",
      [brandId, CUSTOMER_HASH],
    );

    expect(await servedItems()).toStrictEqual([
      { itemId: "MILO", rank: 1, reason: "frequently_ordered" },
      { itemId: "ROTI", rank: 2, reason: "related_to_favourite", detail: { basedOn: ["MILO"] } },
      { itemId: "TEA", rank: 3, reason: "related_to_favourite", detail: { basedOn: ["MILO"] } },
    ]);
  });

  it("serves related items instead of popular ones when every favourite is in the cart", async () => {
    expect(await servedItems({ cart: cartOf("KAYA", "MILO") })).toStrictEqual([
      { itemId: "TEA", rank: 1, reason: "related_to_favourite", detail: { basedOn: ["KAYA", "MILO"] } },
      { itemId: "ROTI", rank: 2, reason: "related_to_favourite", detail: { basedOn: ["MILO"] } },
      { itemId: "EGG", rank: 3, reason: "related_to_favourite", detail: { basedOn: ["KAYA"] } },
    ]);
  });

  it("serves no related items to an anonymous customer", async () => {
    expect((await servedItems({ customerId: undefined })).map((item) => item.itemId)).toEqual(["TOAST"]);
  });

  it("moves a related item shown recently below the other related items", async () => {
    await getTestPool().query(
      "INSERT INTO customer_item_exposures (brand_id, customer_external_id, external_item_id) VALUES ($1, $2, 'TEA')",
      [brandId, CUSTOMER_HASH],
    );
    await closeFeedbackWindow();

    expect((await servedItems()).map((item) => item.itemId)).toEqual(["KAYA", "MILO", "ROTI", "EGG", "TEA"]);
  });

  it("ignores another brand's affinity run", async () => {
    const otherBrandId = await createOtherBrand();
    const otherRunId = await publishRun("item_affinity", otherBrandId);
    await storeAffinity(otherRunId, [["KAYA", "LEAK", 0.99]], otherBrandId);

    expect((await servedItems()).map((item) => item.itemId)).not.toContain("LEAK");
  });

  describe("reserved slot", () => {
    beforeEach(async () => {
      await storeFavourites(customerRunId, [["breakfast", "BUN", 3]]);
    });

    it.each([
      [3, ["KAYA", "MILO", "TEA"]],
      [2, ["KAYA", "TEA"]],
      [1, ["KAYA"]],
    ])("keeps the last of %i slots for a related item, except with a single slot", async (limit, expected) => {
      expect((await servedItems({ limit })).map((item) => item.itemId)).toEqual(expected);
    });

    it("fills the slots left by too few favourites with related items", async () => {
      expect((await servedItems({ limit: 4, exclude: ["MILO", "BUN"] })).map((item) => item.itemId)).toEqual([
        "KAYA",
        "TEA",
        "ROTI",
        "EGG",
      ]);
    });

    it("serves a related item in a single slot when no favourite is left", async () => {
      expect(
        (await servedItems({ limit: 1, cart: cartOf("KAYA", "MILO", "BUN") })).map((item) => item.itemId),
      ).toEqual(["TEA"]);
    });

    it("gives every slot to favourites when no related item is left", async () => {
      expect(
        (await servedItems({ limit: 3, include: ["KAYA", "MILO", "BUN"] })).map((item) => item.itemId),
      ).toEqual(["KAYA", "MILO", "BUN"]);
    });
  });
});
