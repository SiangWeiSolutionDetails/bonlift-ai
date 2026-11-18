import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { readCustomerIdSecret } from "../config/env.js";
import { ValidationError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { createBrand } from "./brand.service.js";
import { createOutlet } from "./outlet.service.js";
import { RecommendationServe, recordRecommendationServe } from "./recommendation.service.js";
import { recordRecommendationFeedback } from "./recommendationFeedback.service.js";
import { createServingConfigVersion } from "./servingConfigVersion.service.js";
import { createTenant } from "./tenant.service.js";

const SECRET = readCustomerIdSecret();
const CUSTOMER_ID = "6591234567";
const CUSTOMER_HASH = hashCustomerId(SECRET, CUSTOMER_ID);

let brandId: string;
let otherBrandId: string;
let outletId: string;

async function storeServe(overrides: Partial<RecommendationServe> = {}): Promise<string> {
  const serve: RecommendationServe = {
    id: randomUUID(),
    brandId,
    storedCustomerId: CUSTOMER_HASH,
    outletId,
    daypart: "all_day",
    runId: null,
    customerRunId: null,
    affinityRunId: null,
    itemIds: ["A", "B"],
    reasons: ["popular_at_outlet", "popular_at_outlet"],
    ...overrides,
  };
  await recordRecommendationServe(getTestPool(), serve, null);
  return serve.id;
}

type FeedbackBody = Omit<Parameters<typeof recordRecommendationFeedback>[2], "recommendationId">;

function feedback(recommendationId: string | null | undefined, body: FeedbackBody, brand = brandId) {
  return recordRecommendationFeedback(getTestPool(), brand, { ...body, recommendationId }, SECRET);
}

async function feedbackArrays(recommendationId: string) {
  const result = await getTestPool().query(
    "SELECT accepted_item_ids, rejected_item_ids FROM recommendation_serves WHERE id = $1",
    [recommendationId],
  );
  return { accepted: result.rows[0].accepted_item_ids, rejected: result.rows[0].rejected_item_ids };
}

async function rejectedItemIds(customerHash = CUSTOMER_HASH, brand = brandId): Promise<string[]> {
  const result = await getTestPool().query(
    `
    SELECT external_item_id
    FROM customer_item_rejections
    WHERE brand_id = $1
      AND customer_external_id = $2
    ORDER BY external_item_id
    `,
    [brand, customerHash],
  );
  return result.rows.map((row) => row.external_item_id);
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

async function backdateServe(recommendationId: string, age: string): Promise<void> {
  await getTestPool().query(
    "UPDATE recommendation_serves SET served_at = now() - $2::interval WHERE id = $1",
    [recommendationId, age],
  );
}

beforeEach(async () => {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  brandId = (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
  otherBrandId = (await createBrand(pool, { tenantId: tenant.id, name: "Other House" })).id;
  outletId = (await createOutlet(pool, { brandId, name: "Boat Quay" })).id;
});

describe("recordRecommendationFeedback (integration)", () => {
  it("records accepted and rejected items once each, a repeat changing nothing", async () => {
    const id = await storeServe();

    await feedback(id, { itemId: "A", type: "accepted", customerId: CUSTOMER_ID });
    await feedback(id, { itemId: "A", type: "accepted", customerId: CUSTOMER_ID });
    await feedback(id, { itemId: "B", type: "rejected", customerId: CUSTOMER_ID });
    await feedback(id, { itemId: "B", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: ["A"], rejected: ["B"] });
    expect(await rejectedItemIds()).toEqual(["B"]);
  });

  it("remembers a rejection sent without a recommendation id, for that customer only", async () => {
    await feedback(undefined, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds()).toEqual(["A"]);
    expect(await rejectedItemIds(hashCustomerId(SECRET, "6598765432"))).toEqual([]);
  });

  it("remembers a rejection sent with a null recommendation id", async () => {
    await feedback(null, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds()).toEqual(["A"]);
  });

  it("records the preference for the key's brand only, leaving another brand's serve untracked", async () => {
    const id = await storeServe();

    await expect(
      feedback(id, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID }, otherBrandId),
    ).resolves.toBeUndefined();

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    expect(await rejectedItemIds()).toEqual([]);
    expect(await rejectedItemIds(CUSTOMER_HASH, otherBrandId)).toEqual(["A"]);
  });

  it("records the preference for an item that was not served, without tracking it", async () => {
    const id = await storeServe();

    await feedback(id, { itemId: "Z", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    expect(await rejectedItemIds()).toEqual(["Z"]);
  });

  it("records the preference for an unknown recommendation id", async () => {
    await expect(
      feedback(randomUUID(), { itemId: "A", type: "rejected", customerId: CUSTOMER_ID }),
    ).resolves.toBeUndefined();

    expect(await rejectedItemIds()).toEqual(["A"]);
  });

  it("records the preference but does not track a serve older than the default 2 hour window", async () => {
    const id = await storeServe();
    await backdateServe(id, "2 hours 1 minute");

    await feedback(id, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    expect(await rejectedItemIds()).toEqual(["A"]);
  });

  it("tracks feedback just inside the default 2 hour window", async () => {
    const id = await storeServe();
    await backdateServe(id, "1 hour 59 minutes");

    await feedback(id, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: ["A"] });
  });

  it("uses the brand's latest feedback window for tracking", async () => {
    await createServingConfigVersion(getTestPool(), brandId, { feedbackWindowMinutes: 30 }, "api");
    const late = await storeServe();
    await backdateServe(late, "31 minutes");
    const inTime = await storeServe();
    await backdateServe(inTime, "29 minutes");

    await feedback(late, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await feedback(inTime, { itemId: "B", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(late)).toStrictEqual({ accepted: [], rejected: [] });
    expect(await feedbackArrays(inTime)).toStrictEqual({ accepted: [], rejected: ["B"] });
    expect(await rejectedItemIds()).toEqual(["A", "B"]);
  });

  it("rejects feedback without a customer id, recording nothing", async () => {
    const id = await storeServe();

    await expect(feedback(id, { itemId: "A", type: "rejected" } as any)).rejects.toThrow(ValidationError);

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    const count = await getTestPool().query("SELECT count(*)::int AS n FROM customer_item_rejections");
    expect(count.rows[0].n).toBe(0);
  });

  it("remembers an identified customer's rejection, a later one moving its time forward", async () => {
    await feedback(undefined, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await getTestPool().query("UPDATE customer_item_rejections SET rejected_at = now() - interval '10 days'");

    await feedback(undefined, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    const result = await getTestPool().query(
      "SELECT brand_id, external_item_id, rejected_at > now() - interval '1 minute' AS recent FROM customer_item_rejections",
    );
    expect(result.rows).toStrictEqual([{ brand_id: brandId, external_item_id: "A", recent: true }]);
  });

  it("forgets a rejection once the customer accepts the item, leaving their other rejections", async () => {
    const first = await storeServe();
    await feedback(first, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await feedback(first, { itemId: "B", type: "rejected", customerId: CUSTOMER_ID });

    const second = await storeServe();
    await feedback(second, { itemId: "A", type: "accepted", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds()).toEqual(["B"]);
  });

  it("forgets a rejection and that the item was shown when accepted without a recommendation id", async () => {
    await storeServe();
    await feedback(undefined, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    await feedback(undefined, { itemId: "A", type: "accepted", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds()).toEqual([]);
    expect(await exposedItemIds()).toEqual(["B"]);
  });

  it("keeps another customer's rejection when this customer accepts the item", async () => {
    const otherHash = hashCustomerId(SECRET, "6598765432");
    const first = await storeServe();
    await feedback(first, { itemId: "A", type: "rejected", customerId: "6598765432" });

    await feedback(first, { itemId: "A", type: "accepted", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds(otherHash)).toEqual(["A"]);
  });

  it("forgets that an accepted item was shown, leaving the other items shown", async () => {
    const id = await storeServe();
    expect(await exposedItemIds()).toEqual(["A", "B"]);

    await feedback(id, { itemId: "A", type: "accepted", customerId: CUSTOMER_ID });
    await feedback(id, { itemId: "B", type: "rejected", customerId: CUSTOMER_ID });

    expect(await exposedItemIds()).toEqual(["B"]);
  });

  it("keeps the items shown for the brand when feedback is sent with another brand's key", async () => {
    const id = await storeServe();

    await feedback(id, { itemId: "A", type: "accepted", customerId: CUSTOMER_ID }, otherBrandId);

    expect(await exposedItemIds()).toEqual(["A", "B"]);
    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
  });

  it("changes nothing more when the same feedback is retried", async () => {
    const id = await storeServe();

    await feedback(id, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await feedback(id, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await feedback(undefined, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: ["A"] });
    const count = await getTestPool().query("SELECT count(*)::int AS n FROM customer_item_rejections");
    expect(count.rows[0].n).toBe(1);
  });
});
