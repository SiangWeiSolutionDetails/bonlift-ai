import { Pool } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import { createBrand, deleteBrand } from "./brand.service.js";
import {
  createServingConfigVersion,
  getLatestServingConfigVersion,
  getServingConfigVersions,
} from "./servingConfigVersion.service.js";
import { createTenant } from "./tenant.service.js";

const UNKNOWN_BRAND_ID = "00000000-0000-0000-0000-000000000000";

let brandId: string;

async function waitForLockWait(pool: Pool): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      `
      SELECT 1
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query LIKE '%serving_config_versions%';
      `,
    );
    if (result.rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The losing change never blocked on the version lock.");
}

beforeEach(async () => {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  brandId = (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
});

describe("servingConfigVersion.service (integration)", () => {
  it("returns version 1 with the default settings for a new brand", async () => {
    const latest = await getLatestServingConfigVersion(getTestPool(), brandId);

    expect(latest).toMatchObject({
      brandId,
      version: 1,
      minFavouriteOrders: 1,
      minPairSample: 50,
      strongPairingLift: 2,
      bestSellerMaxRank: 3,
      bestSellerMinListSize: 10,
    });
  });

  it("lists versions newest first", async () => {
    const pool = getTestPool();
    await createServingConfigVersion(pool, brandId, { minPairSample: 20 }, "api");
    await createServingConfigVersion(pool, brandId, { bestSellerMaxRank: 5 }, "api");

    const versions = await getServingConfigVersions(pool, brandId);

    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("merges unsent settings from the latest version and bumps the version", async () => {
    const pool = getTestPool();
    await createServingConfigVersion(pool, brandId, { minPairSample: 20 }, "api");

    const created = await createServingConfigVersion(
      pool,
      brandId,
      { strongPairingLift: 1.5 },
      "api",
    );

    expect(created).toMatchObject({
      version: 3,
      createdBy: "api",
      minFavouriteOrders: 1,
      minPairSample: 20,
      strongPairingLift: 1.5,
      bestSellerMaxRank: 3,
      bestSellerMinListSize: 10,
    });
  });

  it("rejects a change that loses the version race with ConflictError", async () => {
    const pool = getTestPool();
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query(
        `
        INSERT INTO serving_config_versions (
          brand_id, version, created_by, min_favourite_orders, min_pair_sample,
          strong_pairing_lift, best_seller_max_rank, best_seller_min_list_size
        )
        SELECT brand_id, 2, 'holder', min_favourite_orders, min_pair_sample,
          strong_pairing_lift, best_seller_max_rank, best_seller_min_list_size
        FROM serving_config_versions
        WHERE brand_id = $1 AND version = 1;
        `,
        [brandId],
      );

      const outcome = createServingConfigVersion(pool, brandId, { minPairSample: 20 }, "api").then(
        () => undefined,
        (error: unknown) => error,
      );
      await waitForLockWait(pool);
      await holder.query("COMMIT");

      expect(await outcome).toBeInstanceOf(ConflictError);
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      holder.release();
    }
  });

  it("returns 404 for an unknown or deleted brand", async () => {
    const pool = getTestPool();
    await deleteBrand(pool, brandId);

    for (const id of [UNKNOWN_BRAND_ID, brandId]) {
      await expect(getLatestServingConfigVersion(pool, id)).rejects.toThrow(NotFoundError);
      await expect(getServingConfigVersions(pool, id)).rejects.toThrow(NotFoundError);
      await expect(
        createServingConfigVersion(pool, id, { minPairSample: 20 }, "api"),
      ).rejects.toThrow(NotFoundError);
    }
  });

  it("rejects a strong pairing lift above the column range", async () => {
    await expect(
      createServingConfigVersion(getTestPool(), brandId, { strongPairingLift: 10000 }, "api"),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an out-of-range value", async () => {
    await expect(
      createServingConfigVersion(getTestPool(), brandId, { strongPairingLift: 0.5 }, "api"),
    ).rejects.toThrow(ValidationError);
  });
});
