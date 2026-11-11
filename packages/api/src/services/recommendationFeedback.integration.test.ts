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
    outletId,
    isIdentified: true,
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

function feedback(
  recommendationId: string,
  body: Parameters<typeof recordRecommendationFeedback>[3],
  brand = brandId,
) {
  return recordRecommendationFeedback(getTestPool(), brand, recommendationId, body, SECRET);
}

async function feedbackArrays(recommendationId: string) {
  const result = await getTestPool().query(
    "SELECT accepted_item_ids, rejected_item_ids FROM recommendation_serves WHERE id = $1",
    [recommendationId],
  );
  return { accepted: result.rows[0].accepted_item_ids, rejected: result.rows[0].rejected_item_ids };
}

async function rejectedItemIds(customerHash = CUSTOMER_HASH): Promise<string[]> {
  const result = await getTestPool().query(
    `
    SELECT external_item_id
    FROM customer_item_rejections
    WHERE brand_id = $1
      AND customer_external_id = $2
    ORDER BY external_item_id
    `,
    [brandId, customerHash],
  );
  return result.rows.map((row) => row.external_item_id);
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
  });

  it("ignores feedback sent with another brand's key", async () => {
    const id = await storeServe();

    await expect(
      feedback(id, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID }, otherBrandId),
    ).resolves.toBeUndefined();

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    expect(await rejectedItemIds()).toEqual([]);
  });

  it("ignores an item that was not served", async () => {
    const id = await storeServe();

    await feedback(id, { itemId: "Z", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    expect(await rejectedItemIds()).toEqual([]);
  });

  it("ignores an unknown recommendation id", async () => {
    await expect(
      feedback(randomUUID(), { itemId: "A", type: "accepted", customerId: CUSTOMER_ID }),
    ).resolves.toBeUndefined();
  });

  it("ignores feedback on a serve older than 2 hours", async () => {
    const id = await storeServe();
    await getTestPool().query(
      "UPDATE recommendation_serves SET served_at = now() - interval '2 hours 1 minute' WHERE id = $1",
      [id],
    );

    await feedback(id, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    expect(await rejectedItemIds()).toEqual([]);
  });

  it("ignores feedback on an anonymous serve, even with a customer id", async () => {
    const id = await storeServe({ isIdentified: false });

    await feedback(id, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    expect(await rejectedItemIds()).toEqual([]);
  });

  it("rejects feedback without a customer id, recording nothing", async () => {
    const id = await storeServe();

    await expect(feedback(id, { itemId: "A", type: "rejected" } as any)).rejects.toThrow(ValidationError);

    expect(await feedbackArrays(id)).toStrictEqual({ accepted: [], rejected: [] });
    const count = await getTestPool().query("SELECT count(*)::int AS n FROM customer_item_rejections");
    expect(count.rows[0].n).toBe(0);
  });

  it("remembers an identified customer's rejection, a later one moving its time forward", async () => {
    const first = await storeServe();
    await feedback(first, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await getTestPool().query("UPDATE customer_item_rejections SET rejected_at = now() - interval '10 days'");

    const second = await storeServe();
    await feedback(second, { itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

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

  it("keeps another customer's rejection when this customer accepts the item", async () => {
    const otherHash = hashCustomerId(SECRET, "6598765432");
    const first = await storeServe();
    await feedback(first, { itemId: "A", type: "rejected", customerId: "6598765432" });

    await feedback(first, { itemId: "A", type: "accepted", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds(otherHash)).toEqual(["A"]);
  });
});
