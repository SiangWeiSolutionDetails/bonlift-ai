import { beforeEach, describe, expect, it } from "vitest";
import { readCustomerIdSecret } from "../config/env.js";
import { ValidationError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { createBrand } from "./brand.service.js";
import { recordServedExposures } from "./recommendation.service.js";
import { recordRecommendationFeedback } from "./recommendationFeedback.service.js";
import { createTenant } from "./tenant.service.js";

const SECRET = readCustomerIdSecret();
const CUSTOMER_ID = "6591234567";
const CUSTOMER_HASH = hashCustomerId(SECRET, CUSTOMER_ID);
const OTHER_CUSTOMER_ID = "6598765432";

let brandId: string;
let otherBrandId: string;

async function showItems(itemIds = ["A", "B"], customerHash = CUSTOMER_HASH): Promise<void> {
  await recordServedExposures(getTestPool(), { brandId, storedCustomerId: customerHash, itemIds });
}

type FeedbackBody = Parameters<typeof recordRecommendationFeedback>[2];

function feedback(body: FeedbackBody, brand = brandId) {
  return recordRecommendationFeedback(getTestPool(), brand, body, SECRET);
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

async function exposedItemIds(customerHash = CUSTOMER_HASH): Promise<string[]> {
  const result = await getTestPool().query(
    `
    SELECT external_item_id
    FROM customer_item_exposures
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
});

describe("recordRecommendationFeedback (integration)", () => {
  it("remembers a rejection for that customer only", async () => {
    await feedback({ itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds()).toEqual(["A"]);
    expect(await rejectedItemIds(hashCustomerId(SECRET, OTHER_CUSTOMER_ID))).toEqual([]);
  });

  it("ignores a recommendationId sent by an older client, still recording the preference", async () => {
    await feedback({ itemId: "A", type: "rejected", customerId: CUSTOMER_ID, recommendationId: "rec-1" } as any);

    expect(await rejectedItemIds()).toEqual(["A"]);
  });

  it("writes nothing to recommendation_serves", async () => {
    await showItems();

    await feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID });
    await feedback({ itemId: "B", type: "rejected", customerId: CUSTOMER_ID });

    const count = await getTestPool().query("SELECT count(*)::int AS n FROM recommendation_serves");
    expect(count.rows[0].n).toBe(0);
  });

  it("records the preference for the key's brand only", async () => {
    await expect(
      feedback({ itemId: "A", type: "rejected", customerId: CUSTOMER_ID }, otherBrandId),
    ).resolves.toBeUndefined();

    expect(await rejectedItemIds()).toEqual([]);
    expect(await rejectedItemIds(CUSTOMER_HASH, otherBrandId)).toEqual(["A"]);
  });

  it("records the preference for an item that was never shown", async () => {
    await showItems();

    await feedback({ itemId: "Z", type: "rejected", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds()).toEqual(["Z"]);
  });

  it("rejects feedback without a customer id, recording nothing", async () => {
    await expect(feedback({ itemId: "A", type: "rejected" } as any)).rejects.toThrow(ValidationError);

    const count = await getTestPool().query("SELECT count(*)::int AS n FROM customer_item_rejections");
    expect(count.rows[0].n).toBe(0);
  });

  it("remembers an identified customer's rejection, a later one moving its time forward", async () => {
    await feedback({ itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await getTestPool().query("UPDATE customer_item_rejections SET rejected_at = now() - interval '10 days'");

    await feedback({ itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    const result = await getTestPool().query(
      "SELECT brand_id, external_item_id, rejected_at > now() - interval '1 minute' AS recent FROM customer_item_rejections",
    );
    expect(result.rows).toStrictEqual([{ brand_id: brandId, external_item_id: "A", recent: true }]);
  });

  it("forgets a rejection once the customer accepts the item, leaving their other rejections", async () => {
    await feedback({ itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await feedback({ itemId: "B", type: "rejected", customerId: CUSTOMER_ID });

    await feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds()).toEqual(["B"]);
  });

  it("keeps another customer's rejection when this customer accepts the item", async () => {
    const otherHash = hashCustomerId(SECRET, OTHER_CUSTOMER_ID);
    await feedback({ itemId: "A", type: "rejected", customerId: OTHER_CUSTOMER_ID });

    await feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID });

    expect(await rejectedItemIds(otherHash)).toEqual(["A"]);
  });

  it("forgets that an accepted item was shown, leaving the other items shown", async () => {
    await showItems();

    await feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID });
    await feedback({ itemId: "B", type: "rejected", customerId: CUSTOMER_ID });

    expect(await exposedItemIds()).toEqual(["B"]);
  });

  it("keeps another customer's shown items when this customer accepts the item", async () => {
    const otherHash = hashCustomerId(SECRET, OTHER_CUSTOMER_ID);
    await showItems(["A"], otherHash);

    await feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID });

    expect(await exposedItemIds(otherHash)).toEqual(["A"]);
  });

  it("keeps the items shown for the brand when feedback is sent with another brand's key", async () => {
    await showItems();

    await feedback({ itemId: "A", type: "accepted", customerId: CUSTOMER_ID }, otherBrandId);

    expect(await exposedItemIds()).toEqual(["A", "B"]);
  });

  it("changes nothing more when the same feedback is retried", async () => {
    await feedback({ itemId: "A", type: "rejected", customerId: CUSTOMER_ID });
    await feedback({ itemId: "A", type: "rejected", customerId: CUSTOMER_ID });

    const count = await getTestPool().query("SELECT count(*)::int AS n FROM customer_item_rejections");
    expect(count.rows[0].n).toBe(1);
  });
});
