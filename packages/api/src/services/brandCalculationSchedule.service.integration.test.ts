import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import { createBrand, deleteBrand } from "./brand.service.js";
import {
  getBrandCalculationSchedule,
  ScheduleTiming,
  SyncSchedule,
  updateBrandCalculationSchedule,
} from "./brandCalculationSchedule.service.js";
import { createTenant } from "./tenant.service.js";

const UNKNOWN_BRAND_ID = "00000000-0000-0000-0000-000000000000";

let brandId: string;
let synced: [string, ScheduleTiming][];

const recordingSync: SyncSchedule = async (id, timing) => {
  synced.push([id, timing]);
};

beforeEach(async () => {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  brandId = (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
  synced = [];
});

describe("brandCalculationSchedule.service (integration)", () => {
  it("gives a new brand the default schedule, next due at 03:00 Singapore time", async () => {
    const schedule = await getBrandCalculationSchedule(getTestPool(), brandId);

    expect(schedule).toMatchObject({
      brandId,
      isEnabled: true,
      runTime: "03:00",
      timeZone: "Asia/Singapore",
      outletWindowDays: 28,
      customerWindowDays: 90,
      affinityWindowDays: 90,
      updatedBy: null,
      lastRunAt: null,
      lastQueued: null,
      lastFailedToQueue: null,
      lastError: null,
    });
    const nextRunAt = new Date(schedule.nextRunAt as string);
    // 03:00 at +08:00 is 19:00 UTC, within the next 24 hours
    expect(nextRunAt.getUTCHours()).toBe(19);
    expect(nextRunAt.getUTCMinutes()).toBe(0);
    expect(nextRunAt.getTime() - Date.now()).toBeGreaterThan(0);
    expect(nextRunAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("updates only the sent fields, records who changed it, and syncs the new timing", async () => {
    const pool = getTestPool();

    const updated = await updateBrandCalculationSchedule(
      pool,
      recordingSync,
      brandId,
      { runTime: "02:30", timeZone: "Asia/Kuala_Lumpur", customerWindowDays: 60 },
      "api",
    );

    expect(updated).toMatchObject({
      isEnabled: true,
      runTime: "02:30",
      timeZone: "Asia/Kuala_Lumpur",
      outletWindowDays: 28,
      customerWindowDays: 60,
      affinityWindowDays: 90,
      updatedBy: "api",
    });
    expect(synced).toEqual([[brandId, { isEnabled: true, runTime: "02:30", timeZone: "Asia/Kuala_Lumpur" }]]);
    await expect(getBrandCalculationSchedule(pool, brandId)).resolves.toEqual(updated);
  });

  it("has no next run while disabled, and syncs the disabled state", async () => {
    const updated = await updateBrandCalculationSchedule(
      getTestPool(),
      recordingSync,
      brandId,
      { isEnabled: false },
      "api",
    );

    expect(updated.nextRunAt).toBeNull();
    expect(synced).toEqual([[brandId, { isEnabled: false, runTime: "03:00", timeZone: "Asia/Singapore" }]]);
  });

  it("rejects a time zone Postgres does not know, without changing or syncing anything", async () => {
    const pool = getTestPool();
    const before = await getBrandCalculationSchedule(pool, brandId);

    await expect(
      updateBrandCalculationSchedule(pool, recordingSync, brandId, { timeZone: "Mars/Olympus", runTime: "01:00" }, "api"),
    ).rejects.toThrow(ValidationError);

    expect(synced).toEqual([]);
    await expect(getBrandCalculationSchedule(pool, brandId)).resolves.toEqual(before);
  });

  it("rolls the change back and returns 503 when the scheduler cannot be synced", async () => {
    const pool = getTestPool();
    const before = await getBrandCalculationSchedule(pool, brandId);
    const failingSync: SyncSchedule = async () => {
      throw new Error("Redis is down");
    };

    await expect(
      updateBrandCalculationSchedule(pool, failingSync, brandId, { runTime: "04:15" }, "api"),
    ).rejects.toThrow(ServiceUnavailableError);

    await expect(getBrandCalculationSchedule(pool, brandId)).resolves.toEqual(before);
  });

  it("returns 404 for an unknown or deleted brand", async () => {
    const pool = getTestPool();
    await deleteBrand(pool, brandId);

    for (const id of [UNKNOWN_BRAND_ID, brandId]) {
      await expect(getBrandCalculationSchedule(pool, id)).rejects.toThrow(NotFoundError);
      await expect(
        updateBrandCalculationSchedule(pool, recordingSync, id, { isEnabled: false }, "api"),
      ).rejects.toThrow(NotFoundError);
    }
    expect(synced).toEqual([]);
  });
});
