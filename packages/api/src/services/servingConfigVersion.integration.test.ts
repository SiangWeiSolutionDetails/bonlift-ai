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

  it("rejects every concurrent change that loses the version race with ConflictError", async () => {
    const pool = getTestPool();

    const results = await Promise.allSettled([
      createServingConfigVersion(pool, brandId, { minPairSample: 10 }, "api"),
      createServingConfigVersion(pool, brandId, { minPairSample: 20 }, "api"),
      createServingConfigVersion(pool, brandId, { minPairSample: 30 }, "api"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ConflictError);
    }
    const versions = await getServingConfigVersions(pool, brandId);
    expect(versions).toHaveLength(1 + fulfilled.length);
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

  it("rejects an out-of-range value", async () => {
    await expect(
      createServingConfigVersion(getTestPool(), brandId, { strongPairingLift: 0.5 }, "api"),
    ).rejects.toThrow(ValidationError);
  });
});
