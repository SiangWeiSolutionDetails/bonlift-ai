import { describe, expect, it } from "vitest";
import { readCustomerIdSecret } from "../config/env.js";
import { getTestPool } from "../testing/testDb.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { createBrand } from "./brand.service.js";
import {
  createCustomerItemScoresCalculationConfigVersion,
  getLatestCustomerItemScoresCalculationConfigVersion,
} from "./customerItemScoresCalculationConfigVersion.service.js";
import {
  getCustomerItemScoresCustomerResult,
  getCustomerItemScoresCustomers,
  getCustomerItemScoresRuns,
} from "./customerItemScoresResult.service.js";
import { createOutletItemScoresCalculationConfigVersion } from "./outletItemScoresCalculationConfigVersion.service.js";
import { createTenant } from "./tenant.service.js";

const SECRET = readCustomerIdSecret();
const CUSTOMER_HASH = hashCustomerId(SECRET, "6591234567");

async function createTestBrand(): Promise<string> {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  return (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
}

async function createCustomerRun(brandId: string): Promise<string> {
  const result = await getTestPool().query(
    `
    INSERT INTO computation_runs (
      brand_id, job_type, run_date, algorithm_version, calculation_config_version_id,
      input_window_from, input_window_to, trigger_type, status, row_count
    )
    SELECT $1, 'customer_item_scores', current_date, 'test', v.id, '2026-11-01', '2026-11-01', 'manual', 'succeeded', 1
    FROM calculation_config_versions v
    WHERE v.brand_id = $1
      AND v.job_type = 'customer_item_scores'
    ORDER BY v.version DESC
    LIMIT 1
    RETURNING id;
    `,
    [brandId],
  );
  return result.rows[0].id;
}

describe("customerItemScoresResult.service (integration)", () => {
  it("lists a customer's items by daypart in config order, all_day last, counting each item once", async () => {
    const pool = getTestPool();
    const brandId = await createTestBrand();
    // Config order is dinner before breakfast, so alphabetical order would give the wrong answer
    await createOutletItemScoresCalculationConfigVersion(
      pool,
      brandId,
      {
        dayparts: [
          { name: "dinner", start: "17:00", end: "22:00" },
          { name: "breakfast", start: "06:00", end: "11:00" },
        ],
      },
      "test",
    );
    const runId = await createCustomerRun(brandId);
    await pool.query(
      `
      INSERT INTO customer_item_scores (run_id, run_date, brand_id, customer_external_id, daypart, external_item_id, score, n_orders, rank)
      VALUES ($1, current_date, $2, $3, 'all_day',   'TOAST', 0.6, 3, 1),
             ($1, current_date, $2, $3, 'all_day',   'RICE',  0.4, 2, 2),
             ($1, current_date, $2, $3, 'breakfast', 'TOAST', 1,   3, 1),
             ($1, current_date, $2, $3, 'dinner',    'RICE',  1,   2, 1);
      `,
      [runId, brandId, CUSTOMER_HASH],
    );

    const result = await getCustomerItemScoresCustomerResult(pool, runId, CUSTOMER_HASH);
    const customers = await getCustomerItemScoresCustomers(pool, runId, {});

    expect(result.items.map((item) => [item.daypart, item.itemId, item.rank])).toEqual([
      ["dinner", "RICE", 1],
      ["breakfast", "TOAST", 1],
      ["all_day", "TOAST", 1],
      ["all_day", "RICE", 2],
    ]);
    expect(customers.customers).toEqual([{ customerId: CUSTOMER_HASH, itemCount: 2 }]);
  });

  it("creates a config version with the recent-orders limit and shows it on runs", async () => {
    const pool = getTestPool();
    const brandId = await createTestBrand();

    // A new brand's version 1 gets the column default
    expect((await getLatestCustomerItemScoresCalculationConfigVersion(pool, brandId)).maxRecentOrders).toBe(8);

    const created = await createCustomerItemScoresCalculationConfigVersion(pool, brandId, { maxRecentOrders: 5 }, "test");
    const keptLimit = await createCustomerItemScoresCalculationConfigVersion(pool, brandId, { topN: 10 }, "test");
    await createCustomerRun(brandId);

    expect(created).toMatchObject({ version: 2, maxRecentOrders: 5 });
    expect(keptLimit).toMatchObject({ version: 3, topN: 10, maxRecentOrders: 5 });
    expect((await getCustomerItemScoresRuns(pool, brandId, {}))[0]).toMatchObject({ configVersion: 3, maxRecentOrders: 5 });
  });
});
