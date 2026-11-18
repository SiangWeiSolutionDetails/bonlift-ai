import { beforeEach, describe, expect, it } from "vitest";
import { readCustomerIdSecret } from "../config/env.js";
import { getTestPool } from "../testing/testDb.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { createBrand } from "./brand.service.js";
import { getItemAffinityRecommendations } from "./itemAffinityServing.service.js";
import { createOutlet } from "./outlet.service.js";
import { getRecommendations, recordRecommendationServe } from "./recommendation.service.js";
import { recordRecommendationFeedback } from "./recommendationFeedback.service.js";
import { createServingConfigVersion } from "./servingConfigVersion.service.js";
import { createTenant } from "./tenant.service.js";

const silentLog = { error: () => undefined, warn: () => undefined };

const SECRET = readCustomerIdSecret();
const CUSTOMER_ID = "6591234567";
const CUSTOMER_HASH = hashCustomerId(SECRET, CUSTOMER_ID);
const OTHER_CUSTOMER_ID = "6599999999";

type AffinityRequest = Parameters<typeof getItemAffinityRecommendations>[3];

let brandId: string;
let outletId: string;
let affinityRunId: string;

// A succeeded brand-level run on the brand's latest config version, published the way the worker publishes it.
async function publishBrandRun(jobType: "item_affinity" | "customer_item_scores", brand = brandId): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH run AS (
      INSERT INTO computation_runs (
        brand_id, job_type, run_date, algorithm_version, calculation_config_version_id,
        input_window_from, input_window_to, trigger_type, triggered_by, status, row_count
      )
      SELECT $1, $2, current_date, 'test', v.id, '2026-11-01', '2026-11-01', 'manual', 'test', 'succeeded', 1
      FROM calculation_config_versions v
      WHERE v.brand_id = $1
        AND v.job_type = $2
      ORDER BY v.version DESC
      LIMIT 1
      RETURNING id, brand_id, job_type
    ),
    published AS (
      INSERT INTO brand_published_runs (brand_id, job_type, run_id)
      SELECT brand_id, job_type, id FROM run
    )
    SELECT id FROM run;
    `,
    [brand, jobType],
  );
  return result.rows[0].id;
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

async function storeFavourite(runId: string, itemId: string) {
  await getTestPool().query(
    `
    INSERT INTO customer_item_scores (run_id, run_date, brand_id, customer_external_id, daypart, external_item_id, score, n_orders, rank)
    VALUES ($1, current_date, $2, $3, 'all_day', $4, 0.9, 3, 1);
    `,
    [runId, brandId, CUSTOMER_HASH, itemId],
  );
}

function serve(request: Partial<AffinityRequest> = {}) {
  return getItemAffinityRecommendations(
    getTestPool(),
    silentLog,
    brandId,
    { cart: [{ itemId: "KOPI", qty: 1 }], outletId, customerId: CUSTOMER_ID, ...request },
    SECRET,
  );
}

// Serves and records the serve the way the route's onResponse hook does.
async function serveAndRecord(request: Partial<AffinityRequest> = {}) {
  const served = await serve(request);
  if (served.serve) {
    await recordRecommendationServe(getTestPool(), served.serve, null);
  }
  return served;
}

async function servedItemIds(request: Partial<AffinityRequest> = {}): Promise<string[]> {
  return (await serve(request)).response.items.map((item) => item.itemId);
}

async function storedServes() {
  const result = await getTestPool().query(
    `
    SELECT id, outlet_id, daypart, run_id, customer_run_id, affinity_run_id, item_ids, reasons,
           accepted_item_ids, rejected_item_ids
    FROM recommendation_serves
    ORDER BY served_at
    `,
  );
  return result.rows;
}

async function exposedItemIds(): Promise<string[]> {
  const result = await getTestPool().query(
    `
    SELECT external_item_id
    FROM customer_item_exposures
    WHERE brand_id = $1
      AND customer_external_id = $2
    ORDER BY external_item_id
    `,
    [brandId, CUSTOMER_HASH],
  );
  return result.rows.map((row) => row.external_item_id);
}

function feedback(recommendationId: string | undefined, itemId: string, type: "accepted" | "rejected") {
  return recordRecommendationFeedback(
    getTestPool(),
    brandId,
    { recommendationId, itemId, type, customerId: CUSTOMER_ID },
    SECRET,
  );
}

async function reject(itemId: string, daysAgo: number) {
  await getTestPool().query(
    `
    INSERT INTO customer_item_rejections (brand_id, customer_external_id, external_item_id, rejected_at)
    VALUES ($1, $2, $3, now() - make_interval(days => $4))
    `,
    [brandId, CUSTOMER_HASH, itemId, daysAgo],
  );
}

beforeEach(async () => {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  brandId = (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
  outletId = (await createOutlet(pool, { brandId, name: "Boat Quay" })).id;
  affinityRunId = await publishBrandRun("item_affinity");
  await storeAffinity(affinityRunId, [
    ["KOPI", "TOAST", 0.8],
    ["KOPI", "EGG", 0.6],
    ["KOPI", "KAYA", 0.4],
  ]);
});

describe("getItemAffinityRecommendations serves (integration)", () => {
  it("serves pairings strongest first, whether or not the customer is identified", async () => {
    expect(await servedItemIds()).toEqual(["TOAST", "EGG", "KAYA"]);
    expect(await servedItemIds({ customerId: undefined, outletId: undefined })).toEqual(["TOAST", "EGG", "KAYA"]);
  });

  it("records a serve for an identified customer at an outlet of the brand, keeping no customer id", async () => {
    const { response } = await serveAndRecord({ limit: 2 });

    expect(response.recommendationId).not.toBeNull();
    expect(await storedServes()).toStrictEqual([
      {
        id: response.recommendationId,
        outlet_id: outletId,
        daypart: "all_day",
        run_id: null,
        customer_run_id: null,
        affinity_run_id: affinityRunId,
        item_ids: ["TOAST", "EGG"],
        reasons: ["often_ordered_with", "often_ordered_with"],
        accepted_item_ids: [],
        rejected_item_ids: [],
      },
    ]);
    const stored = await getTestPool().query("SELECT row_to_json(s)::text AS row FROM recommendation_serves s");
    expect(stored.rows[0].row).not.toContain(CUSTOMER_HASH);
    expect(stored.rows[0].row).not.toContain(CUSTOMER_ID);
    expect(await exposedItemIds()).toEqual(["EGG", "TOAST"]);
  });

  it("does not move items shown before down: cart pairings stay strongest first", async () => {
    await serveAndRecord({ limit: 1 });
    await getTestPool().query("UPDATE customer_item_exposures SET last_shown_at = now() - interval '3 hours'");

    expect(await servedItemIds()).toEqual(["TOAST", "EGG", "KAYA"]);
  });

  describe("records nothing and has no id", () => {
    async function expectNothingRecorded(request: Partial<AffinityRequest>) {
      const { response, serve: served } = await serveAndRecord(request);

      expect(response.recommendationId).toBeNull();
      expect(served).toBeNull();
      expect(await storedServes()).toEqual([]);
      expect(await exposedItemIds()).toEqual([]);
      return response;
    }

    it("without a customer id, still serving the same items", async () => {
      const response = await expectNothingRecorded({ customerId: undefined });

      expect(response.items.map((item) => item.itemId)).toEqual(["TOAST", "EGG", "KAYA"]);
    });

    it("without an outlet id, still serving the same items", async () => {
      const response = await expectNothingRecorded({ outletId: undefined });

      expect(response.items.map((item) => item.itemId)).toEqual(["TOAST", "EGG", "KAYA"]);
    });

    it("for another brand's outlet, still serving the same items", async () => {
      const tenant = await createTenant(getTestPool(), { name: "Other Foods" });
      const otherBrandId = (await createBrand(getTestPool(), { tenantId: tenant.id, name: "Other House" })).id;
      const otherOutletId = (await createOutlet(getTestPool(), { brandId: otherBrandId, name: "Elsewhere" })).id;

      const response = await expectNothingRecorded({ outletId: otherOutletId });

      expect(response.items.map((item) => item.itemId)).toEqual(["TOAST", "EGG", "KAYA"]);
    });

    it("for an unknown outlet", async () => {
      await expectNothingRecorded({ outletId: "3f6c2a9e-8d1b-4c57-9a0e-2b7d4f1e6c35" });
    });

    it("for an inactive outlet", async () => {
      await getTestPool().query("UPDATE outlets SET is_active = FALSE WHERE id = $1", [outletId]);

      await expectNothingRecorded({});
    });

    it("for a deleted outlet", async () => {
      await getTestPool().query("UPDATE outlets SET deleted_at = now() WHERE id = $1", [outletId]);

      await expectNothingRecorded({});
    });

    it("when no item is returned", async () => {
      const response = await expectNothingRecorded({ cart: [{ itemId: "TEA", qty: 1 }] });

      expect(response.items).toEqual([]);
    });
  });
});

describe("feedback on item affinity serves (integration)", () => {
  it("records accepted and rejected items on the serve through the shared feedback endpoint", async () => {
    const { response } = await serveAndRecord();
    const id = response.recommendationId as string;

    await feedback(id, "TOAST", "accepted");
    await feedback(id, "EGG", "rejected");

    const [stored] = await storedServes();
    expect(stored.accepted_item_ids).toEqual(["TOAST"]);
    expect(stored.rejected_item_ids).toEqual(["EGG"]);
    expect(await exposedItemIds()).toEqual(["EGG", "KAYA"]);
  });

  it("stops serving a rejected item to that customer only", async () => {
    const { response } = await serveAndRecord();

    await feedback(response.recommendationId as string, "TOAST", "rejected");

    expect(await servedItemIds()).toEqual(["EGG", "KAYA"]);
    expect(await servedItemIds({ customerId: OTHER_CUSTOMER_ID })).toEqual(["TOAST", "EGG", "KAYA"]);
    expect(await servedItemIds({ customerId: undefined })).toEqual(["TOAST", "EGG", "KAYA"]);
  });

  it("stops serving an item rejected without a recommendation id, to that customer only", async () => {
    await feedback(undefined, "TOAST", "rejected");

    expect(await servedItemIds()).toEqual(["EGG", "KAYA"]);
    expect(await servedItemIds({ customerId: OTHER_CUSTOMER_ID })).toEqual(["TOAST", "EGG", "KAYA"]);
    expect(await servedItemIds({ customerId: undefined })).toEqual(["TOAST", "EGG", "KAYA"]);
  });

  it("serves an item again once the customer accepts it without a recommendation id", async () => {
    await feedback(undefined, "TOAST", "rejected");

    await feedback(undefined, "TOAST", "accepted");

    expect(await servedItemIds()).toEqual(["TOAST", "EGG", "KAYA"]);
  });

  it("stops recommending an item rejected on an item affinity serve", async () => {
    const customerRunId = await publishBrandRun("customer_item_scores");
    await storeFavourite(customerRunId, "TOAST");
    const request = { outletId, cart: [], customerId: CUSTOMER_ID };
    const before = await getRecommendations(getTestPool(), silentLog, brandId, request, SECRET);
    expect(before.response.items.map((item) => item.itemId)).toEqual(["TOAST"]);

    const { response } = await serveAndRecord();
    await feedback(response.recommendationId as string, "TOAST", "rejected");

    const after = await getRecommendations(getTestPool(), silentLog, brandId, request, SECRET);
    expect(after.response.items.map((item) => item.itemId)).not.toContain("TOAST");
  });

  it("serves a rejected item again once the window has passed", async () => {
    await reject("TOAST", 31);

    expect(await servedItemIds()).toEqual(["TOAST", "EGG", "KAYA"]);
  });

  it("suppresses nothing with a window of 0 days", async () => {
    await reject("TOAST", 0);
    await createServingConfigVersion(getTestPool(), brandId, { rejectionSuppressionDays: 0 }, "test");

    expect(await servedItemIds()).toEqual(["TOAST", "EGG", "KAYA"]);
  });

  it("applies the limit after removing rejected items", async () => {
    await reject("TOAST", 1);

    expect(await servedItemIds({ limit: 2 })).toEqual(["EGG", "KAYA"]);
  });
});
