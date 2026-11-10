import { describe, expect, it } from "vitest";
import { readCustomerIdSecret } from "../config/env.js";
import { getTestPool } from "../testing/testDb.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { createBrand } from "./brand.service.js";
import { searchCustomerItemScoresCustomer } from "./customerItemScoresResult.service.js";
import { storeOrderSnapshots } from "./orderSnapshot.service.js";
import { createOutlet } from "./outlet.service.js";
import { getRecommendations } from "./recommendation.service.js";
import { createTenant } from "./tenant.service.js";

const SECRET = readCustomerIdSecret();
const silentLog = { error: () => undefined, warn: () => undefined };

function order(orderId: string, customerId: string) {
  return {
    orderId,
    orderedAt: "2026-11-01T12:00:00+08:00",
    orderTotal: 5,
    customerId,
    lines: [{ itemId: "KOPI", itemName: "Kopi", qty: 1, unitPrice: 5 }],
  };
}

async function setUpOutlet() {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  const brandId = (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
  const outletId = (await createOutlet(pool, { brandId, name: "Boat Quay" })).id;
  return { brandId, outletId };
}

// A published customer run holding one favourite per stored id, the way the worker would score the uploaded orders.
async function publishFavourites(brandId: string, customerIds: string[]): Promise<string> {
  const result = await getTestPool().query(
    `
    WITH run AS (
      INSERT INTO computation_runs (
        brand_id, outlet_id, job_type, run_date, algorithm_version, calculation_config_version_id,
        input_window_from, input_window_to, trigger_type, triggered_by, status, row_count
      )
      SELECT $1, NULL, 'customer_item_scores', current_date, 'test', v.id,
             '2026-11-01', '2026-11-01', 'manual', 'test', 'succeeded', cardinality($2::text[])
      FROM calculation_config_versions v
      WHERE v.brand_id = $1
        AND v.job_type = 'customer_item_scores'
      ORDER BY v.version DESC
      LIMIT 1
      RETURNING id, brand_id, job_type
    ),
    scores AS (
      INSERT INTO customer_item_scores (run_id, run_date, brand_id, customer_external_id, daypart, external_item_id, score, n_orders, rank)
      SELECT run.id, current_date, run.brand_id, c.id, 'all_day', 'KOPI', 1, 2, 1
      FROM run
      CROSS JOIN unnest($2::text[]) AS c(id)
    ),
    published AS (
      INSERT INTO brand_published_runs (brand_id, job_type, run_id)
      SELECT brand_id, job_type, id FROM run
    )
    SELECT id FROM run;
    `,
    [brandId, customerIds],
  );
  return result.rows[0].id;
}

describe("customer ids (integration)", () => {
  it("stores only hashes, and finds the same customer by the plain mobile number or email", async () => {
    const pool = getTestPool();
    const { brandId, outletId } = await setUpOutlet();

    const upload = await storeOrderSnapshots(
      pool,
      outletId,
      {
        outletName: "Boat Quay",
        dates: [
          {
            date: "20261101",
            orders: [
              order("SAL-1", "6591234567"),
              order("SAL-2", "Tan@Mail.com"),
              order("SAL-3", "tan-6591234567"),
            ],
          },
        ],
      },
      SECRET,
    );
    expect(upload.dates[0]).toMatchObject({ orderCount: 3, anonymisedCount: 1 });

    const stored = await pool.query(
      `SELECT o->>'customerId' AS customer_id
       FROM order_snapshots os
       CROSS JOIN LATERAL jsonb_array_elements(os.orders) AS o
       WHERE os.outlet_id = $1
       ORDER BY o->>'orderId'`,
      [outletId],
    );
    const storedIds: (string | null)[] = stored.rows.map((row) => row.customer_id);
    expect(storedIds).toStrictEqual([
      hashCustomerId(SECRET, "6591234567"),
      hashCustomerId(SECRET, "tan@mail.com"),
      null,
    ]);
    const raw = await pool.query("SELECT orders::text AS orders FROM order_snapshots WHERE outlet_id = $1", [outletId]);
    expect(raw.rows[0].orders).not.toMatch(/6591234567|tan@mail\.com/i);

    const runId = await publishFavourites(brandId, storedIds.filter((id): id is string => id !== null));
    const scoreIds = await pool.query(
      "SELECT DISTINCT customer_external_id FROM customer_item_scores WHERE run_id = $1",
      [runId],
    );
    expect(scoreIds.rows.every((row) => row.customer_external_id.startsWith("h1:"))).toBe(true);

    for (const customerId of ["6591234567", "tan@mail.com", " TAN@MAIL.COM "]) {
      const response = await getRecommendations(pool, silentLog, brandId, { outletId, cart: [], customerId }, SECRET);
      expect(response.items).toStrictEqual([{ itemId: "KOPI", rank: 1, reason: "frequently_ordered" }]);
    }

    const found = await searchCustomerItemScoresCustomer(pool, runId, { customerId: "Tan@Mail.com" }, SECRET);
    expect(found.customers).toStrictEqual([{ customerId: hashCustomerId(SECRET, "tan@mail.com"), itemCount: 1 }]);
    const missing = await searchCustomerItemScoresCustomer(pool, runId, { customerId: "659123" }, SECRET);
    expect(missing.customers).toStrictEqual([]);
  });

  it("rejects a malformed customer id on /v1 with a 400", async () => {
    const { brandId, outletId } = await setUpOutlet();

    await expect(
      getRecommendations(getTestPool(), silentLog, brandId, { outletId, cart: [], customerId: "+6591234567" }, SECRET),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
