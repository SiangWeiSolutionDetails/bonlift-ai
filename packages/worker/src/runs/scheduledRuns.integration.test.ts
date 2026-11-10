import { closePool, getPool } from "@bonlift-ai/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  queueScheduledCalculations,
  ScheduledCalculationsDeps,
} from "../processors/scheduledCalculations.processor.js";
import { BrandScheduleTiming } from "../queues/scheduledCalculations.queue.js";
import { reconcileCalculationSchedules } from "../schedules/reconcileCalculationSchedules.js";
import {
  createBrandFixture,
  createOutletFixture,
  createRunFixture,
  order,
  storeOrders,
} from "../testing/fixtures.js";
import { createScheduledRuns } from "./scheduledRuns.repository.js";

const TIME_ZONE = "Asia/Singapore";

let today: string;
let yesterday: string;

// Dates relative to "today" in the schedule's zone, worked out by Postgres the same way the statement does.
async function daysAgo(days: number): Promise<string> {
  const result = await getPool().query(
    `SELECT ((now() AT TIME ZONE $1)::date - $2::int)::text AS day`,
    [TIME_ZONE, days],
  );
  return result.rows[0].day;
}

async function brandWithOrders(options: { isActive?: boolean; deleted?: boolean } = {}) {
  const pool = getPool();
  const brandId = await createBrandFixture(pool, options);
  const outletId = await createOutletFixture(pool, brandId);
  await storeOrders(pool, outletId, yesterday, [order("O1", `${yesterday}T12:00:00+08:00`, ["RICE"], "C1")]);
  return { brandId, outletId };
}

async function setSchedule(brandId: string, columns: Record<string, unknown>) {
  const names = Object.keys(columns);
  await getPool().query(
    `UPDATE brand_calculation_schedules SET ${names.map((name, i) => `${name} = $${i + 2}`).join(", ")} WHERE brand_id = $1`,
    [brandId, ...Object.values(columns)],
  );
}

async function scheduleState(brandId: string) {
  const result = await getPool().query(
    `
    SELECT last_run_at IS NOT NULL AS has_run, last_queued, last_failed_to_queue, last_error
    FROM brand_calculation_schedules
    WHERE brand_id = $1;
    `,
    [brandId],
  );
  return result.rows[0];
}

async function runsFor(brandId: string) {
  const result = await getPool().query(
    `
    SELECT outlet_id, job_type, run_date::text AS run_date, input_window_from::text AS window_from,
           input_window_to::text AS window_to, trigger_type, triggered_by, status, error
    FROM computation_runs
    WHERE brand_id = $1
    ORDER BY job_type, created_at;
    `,
    [brandId],
  );
  return result.rows;
}

function fakeDeps(overrides: Partial<ScheduledCalculationsDeps["queues"]> = {}) {
  const queued: string[] = [];
  const removed: string[] = [];
  const synced: [string, string, string][] = [];
  const record = (jobType: string) => async () => {
    queued.push(jobType);
  };
  const deps: ScheduledCalculationsDeps = {
    queues: {
      outlet_item_scores: record("outlet_item_scores"),
      customer_item_scores: record("customer_item_scores"),
      item_affinity: record("item_affinity"),
      ...overrides,
    },
    removeSchedule: async (brandId) => {
      removed.push(brandId);
    },
    syncSchedule: async (brandId, timing) => {
      synced.push([brandId, timing.runTime, timing.timeZone]);
    },
  };
  return { deps, queued, removed, synced };
}

beforeEach(async () => {
  today = await daysAgo(0);
  yesterday = await daysAgo(1);
});

afterAll(async () => {
  await closePool();
});

describe("createScheduledRuns (integration)", () => {
  it("creates the brand's outlet, customer and affinity runs, with the schedule's windows ending yesterday", async () => {
    const pool = getPool();
    const { brandId, outletId } = await brandWithOrders();
    const other = await brandWithOrders();
    await setSchedule(brandId, { outlet_window_days: 7, customer_window_days: 30, affinity_window_days: 60 });

    const runs = await createScheduledRuns(pool, brandId);

    expect(runs.map((run) => run.jobType).sort()).toEqual([
      "customer_item_scores",
      "item_affinity",
      "outlet_item_scores",
    ]);
    const scheduled = { run_date: today, window_to: yesterday, trigger_type: "scheduled", triggered_by: "scheduler", status: "running", error: null };
    expect(await runsFor(brandId)).toEqual([
      { ...scheduled, outlet_id: null, job_type: "customer_item_scores", window_from: await daysAgo(30) },
      { ...scheduled, outlet_id: null, job_type: "item_affinity", window_from: await daysAgo(60) },
      { ...scheduled, outlet_id: outletId, job_type: "outlet_item_scores", window_from: await daysAgo(7) },
    ]);
    // Only the scheduled brand runs
    expect(await runsFor(other.brandId)).toEqual([]);
  });

  it("uses the default windows for a new brand", async () => {
    const { brandId } = await brandWithOrders();

    await createScheduledRuns(getPool(), brandId);

    expect((await runsFor(brandId)).map((run) => [run.job_type, run.window_from])).toEqual([
      ["customer_item_scores", await daysAgo(90)],
      ["item_affinity", await daysAgo(90)],
      ["outlet_item_scores", await daysAgo(28)],
    ]);
  });

  it("skips an outlet with no orders in its window but still runs its brand", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool);
    const outletId = await createOutletFixture(pool, brandId);
    // Inside the 90-day brand windows, outside the 28-day outlet window
    const fortyDaysAgo = await daysAgo(40);
    await storeOrders(pool, outletId, fortyDaysAgo, [order("O1", `${fortyDaysAgo}T12:00:00+08:00`, ["RICE"])]);

    await createScheduledRuns(pool, brandId);

    expect((await runsFor(brandId)).map((run) => run.job_type)).toEqual([
      "customer_item_scores",
      "item_affinity",
    ]);
  });

  it("creates nothing for a disabled schedule, an inactive brand or a deleted brand", async () => {
    const pool = getPool();
    const disabled = await brandWithOrders();
    await setSchedule(disabled.brandId, { is_enabled: false });
    const inactive = await brandWithOrders({ isActive: false });
    const deleted = await brandWithOrders({ deleted: true });

    for (const { brandId } of [disabled, inactive, deleted]) {
      expect(await createScheduledRuns(pool, brandId)).toEqual([]);
      expect(await runsFor(brandId)).toEqual([]);
    }
  });

  it("skips an inactive outlet but still runs its brand", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool);
    const closedOutlet = await createOutletFixture(pool, brandId, { isActive: false });
    await storeOrders(pool, closedOutlet, yesterday, [order("O1", `${yesterday}T12:00:00+08:00`, ["RICE"])]);

    await createScheduledRuns(pool, brandId);

    // Brand-level calculations still read an inactive outlet's history, so the brand runs; the outlet does not
    expect((await runsFor(brandId)).map((run) => run.job_type)).toEqual([
      "customer_item_scores",
      "item_affinity",
    ]);
  });

  it("skips scopes that already have a running run", async () => {
    const pool = getPool();
    const { brandId, outletId } = await brandWithOrders();
    await createRunFixture(pool, { brandId, outletId, jobType: "outlet_item_scores", from: yesterday, to: yesterday });
    await createRunFixture(pool, { brandId, jobType: "customer_item_scores", from: yesterday, to: yesterday });

    const runs = await createScheduledRuns(pool, brandId);

    expect(runs.map((run) => run.jobType)).toEqual(["item_affinity"]);
    expect((await runsFor(brandId)).map((run) => [run.job_type, run.trigger_type])).toEqual([
      ["customer_item_scores", "manual"],
      ["item_affinity", "scheduled"],
      ["outlet_item_scores", "manual"],
    ]);
  });
});

describe("queueScheduledCalculations (integration)", () => {
  it("fails only the run that could not be queued, queues the others and records the outcome", async () => {
    const pool = getPool();
    const { brandId } = await brandWithOrders();
    const { deps, queued } = fakeDeps({
      outlet_item_scores: async () => {
        throw new Error("Redis is down");
      },
    });

    const summary = await queueScheduledCalculations(pool, deps, brandId);

    expect(summary).toEqual({ queued: 2, failedToQueue: 1, skipped: false });
    expect(queued.sort()).toEqual(["customer_item_scores", "item_affinity"]);
    expect((await runsFor(brandId)).map((run) => [run.job_type, run.status, run.error])).toEqual([
      ["customer_item_scores", "running", null],
      ["item_affinity", "running", null],
      ["outlet_item_scores", "failed", "Fail to queue."],
    ]);
    expect(await scheduleState(brandId)).toEqual({
      has_run: true,
      last_queued: 2,
      last_failed_to_queue: 1,
      last_error: null,
    });
  });

  it("records the error when the job itself fails, and clears it on the next success", async () => {
    const pool = getPool();
    const { brandId } = await brandWithOrders();
    // Bypasses the API's zone check, so the statement's AT TIME ZONE fails
    await setSchedule(brandId, { time_zone: "Mars/Olympus" });
    const { deps } = fakeDeps();

    await expect(queueScheduledCalculations(pool, deps, brandId)).rejects.toThrow();
    expect(await scheduleState(brandId)).toMatchObject({ has_run: true, last_queued: null });
    expect((await scheduleState(brandId)).last_error).toContain("Mars/Olympus");

    await setSchedule(brandId, { time_zone: TIME_ZONE });
    await queueScheduledCalculations(pool, deps, brandId);
    expect(await scheduleState(brandId)).toMatchObject({ last_queued: 3, last_error: null });
  });

  it.each([
    ["disabled", { deleted: false }],
    ["deleted", { deleted: true }],
  ])("removes the scheduler of a %s brand and queues nothing", async (_name, options) => {
    const pool = getPool();
    const { brandId } = await brandWithOrders(options);
    if (!options.deleted) await setSchedule(brandId, { is_enabled: false });
    const { deps, queued, removed } = fakeDeps();

    const summary = await queueScheduledCalculations(pool, deps, brandId);

    expect(summary).toEqual({ queued: 0, failedToQueue: 0, skipped: "disabled" });
    expect(removed).toEqual([brandId]);
    expect(queued).toEqual([]);
    expect(await runsFor(brandId)).toEqual([]);
  });
});

describe("reconcileCalculationSchedules (integration)", () => {
  it("syncs every brand from the database, disabling deleted and switched-off brands, and drops the legacy scheduler", async () => {
    const pool = getPool();
    const live = await createBrandFixture(pool);
    await setSchedule(live, { run_time: "02:30", time_zone: "Asia/Kuala_Lumpur" });
    const off = await createBrandFixture(pool);
    await setSchedule(off, { is_enabled: false });
    const deleted = await createBrandFixture(pool, { deleted: true });
    const synced = new Map<string, BrandScheduleTiming>();
    let legacyRemoved = false;

    const enabled = await reconcileCalculationSchedules(pool, {
      sync: async (brandId, timing) => {
        synced.set(brandId, timing);
      },
      removeLegacy: async () => {
        legacyRemoved = true;
      },
    });

    expect(enabled).toBe(1);
    expect(legacyRemoved).toBe(true);
    expect(synced.get(live)).toEqual({ isEnabled: true, runTime: "02:30", timeZone: "Asia/Kuala_Lumpur" });
    expect(synced.get(off)?.isEnabled).toBe(false);
    expect(synced.get(deleted)?.isEnabled).toBe(false);
  });

  it("rebuilds a scheduler that fired with an outdated time and queues nothing", async () => {
    const pool = getPool();
    const { brandId } = await brandWithOrders();
    const { deps, queued, synced } = fakeDeps();

    const summary = await queueScheduledCalculations(pool, deps, brandId, {
      runTime: "05:00",
      timeZone: TIME_ZONE,
    });

    expect(summary).toEqual({ queued: 0, failedToQueue: 0, skipped: "timing_changed" });
    expect(synced).toEqual([[brandId, "03:00", TIME_ZONE]]);
    expect(queued).toEqual([]);
    expect(await runsFor(brandId)).toEqual([]);
    expect(await scheduleState(brandId)).toMatchObject({ has_run: false });
  });

  it("runs when the fired timing matches the brand's schedule", async () => {
    const pool = getPool();
    const { brandId } = await brandWithOrders();
    const { deps, synced } = fakeDeps();

    const summary = await queueScheduledCalculations(pool, deps, brandId, {
      runTime: "03:00",
      timeZone: TIME_ZONE,
    });

    expect(summary).toEqual({ queued: 3, failedToQueue: 0, skipped: false });
    expect(synced).toEqual([]);
  });
});
