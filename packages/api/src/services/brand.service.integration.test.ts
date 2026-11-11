import { describe, expect, it } from "vitest";
import { getTestPool } from "../testing/testDb.js";
import { createBrand } from "./brand.service.js";
import { createTenant } from "./tenant.service.js";

describe("brand.service (integration)", () => {
  it("gives a new brand version 1 of the serving config with the defaults", async () => {
    const pool = getTestPool();
    const tenant = await createTenant(pool, { name: "Acme Foods" });
    const brand = await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" });

    const result = await pool.query(
      `SELECT version, created_by, min_favourite_orders,
              best_seller_max_rank, best_seller_min_list_size
       FROM serving_config_versions
       WHERE brand_id = $1`,
      [brand.id],
    );

    expect(result.rows).toEqual([
      {
        version: 1,
        created_by: null,
        min_favourite_orders: 1,
        best_seller_max_rank: 3,
        best_seller_min_list_size: 10,
      },
    ]);
  });
});
