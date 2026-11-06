import { closePool, getPool } from "@bonlift-ai/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { queueScheduledCalculations, QueueByJobType } from "../processors/scheduledCalculations.processor.js";
import {
  createBrandFixture,
  createOutletFixture,
  createRunFixture,
  order,
  storeOrders,
} from "../testing/fixtures.js";
import { createScheduledRuns } from "./scheduledRuns.repository.js";

const TIME_ZONE = "Asia/Singapore";
const WINDOWS = { timeZone: TIME_ZONE, outletWindowDays: 28, brandWindowDays: 90 };

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

beforeEach(async () => {
  today = await daysAgo(0);
  yesterday = await daysAgo(1);
});

afterAll(async () => {
  await closePool();
});

describe("createScheduledRuns (integration)", () => {
  it("creates outlet runs per live outlet and brand runs per live brand, with windows ending yesterday", async () => {
    const pool = getPool();
    const { brandId, outletId } = await brandWithOrders();

    const runs = await createScheduledRuns(pool, WINDOWS);

    expect(runs.map((run) => run.jobType).sort()).toEqual([
      "customer_item_scores",
      "item_affinity",
      "outlet_item_scores",
    ]);
    const scheduled = { run_date: today, window_to: yesterday, trigger_type: "scheduled", triggered_by: "scheduler", status: "running", error: null };
    expect(await runsFor(brandId)).toEqual([
      { ...scheduled, outlet_id: null, job_type: "customer_item_scores", window_from: await daysAgo(90) },
      { ...scheduled, outlet_id: null, job_type: "item_affinity", window_from: await daysAgo(90) },
      { ...scheduled, outlet_id: outletId, job_type: "outlet_item_scores", window_from: await daysAgo(28) },
    ]);
  });

  it("skips an outlet with no orders in its window but still runs its brand", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool);
    const outletId = await createOutletFixture(pool, brandId);
    // Inside the 90-day brand window, outside the 28-day outlet window
    const fortyDaysAgo = await daysAgo(40);
    await storeOrders(pool, outletId, fortyDaysAgo, [order("O1", `${fortyDaysAgo}T12:00:00+08:00`, ["RICE"])]);

    await createScheduledRuns(pool, WINDOWS);

    expect((await runsFor(brandId)).map((run) => run.job_type)).toEqual([
      "customer_item_scores",
      "item_affinity",
    ]);
  });

  it("skips inactive and deleted brands, and inactive outlets", async () => {
    const pool = getPool();
    const inactive = await brandWithOrders({ isActive: false });
    const deleted = await brandWithOrders({ deleted: true });
    const live = await createBrandFixture(pool);
    const closedOutlet = await createOutletFixture(pool, live, { isActive: false });
    await storeOrders(pool, closedOutlet, yesterday, [order("O1", `${yesterday}T12:00:00+08:00`, ["RICE"])]);

    await createScheduledRuns(pool, WINDOWS);

    expect(await runsFor(inactive.brandId)).toEqual([]);
    expect(await runsFor(deleted.brandId)).toEqual([]);
    // Brand-level calculations still read an inactive outlet's history, so the brand runs; the outlet does not
    expect((await runsFor(live)).map((run) => run.job_type)).toEqual([
      "customer_item_scores",
      "item_affinity",
    ]);
  });

  it("skips scopes that already have a running run", async () => {
    const pool = getPool();
    const { brandId, outletId } = await brandWithOrders();
    await createRunFixture(pool, { brandId, outletId, jobType: "outlet_item_scores", from: yesterday, to: yesterday });
    await createRunFixture(pool, { brandId, jobType: "customer_item_scores", from: yesterday, to: yesterday });

    const runs = await createScheduledRuns(pool, WINDOWS);

    expect(runs.map((run) => run.jobType)).toEqual(["item_affinity"]);
    expect((await runsFor(brandId)).map((run) => [run.job_type, run.trigger_type])).toEqual([
      ["customer_item_scores", "manual"],
      ["item_affinity", "scheduled"],
      ["outlet_item_scores", "manual"],
    ]);
  });
});

describe("queueScheduledCalculations (integration)", () => {
  it("fails only the run that could not be queued and still queues the others", async () => {
    const pool = getPool();
    const { brandId } = await brandWithOrders();
    const queued: string[] = [];
    const queues: QueueByJobType = {
      outlet_item_scores: async () => {
        throw new Error("Redis is down");
      },
      customer_item_scores: async () => {
        queued.push("customer_item_scores");
      },
      item_affinity: async () => {
        queued.push("item_affinity");
      },
    };

    const summary = await queueScheduledCalculations(pool, queues, WINDOWS);

    expect(summary).toEqual({ queued: 2, failedToQueue: 1 });
    expect(queued.sort()).toEqual(["customer_item_scores", "item_affinity"]);
    expect((await runsFor(brandId)).map((run) => [run.job_type, run.status, run.error])).toEqual([
      ["customer_item_scores", "running", null],
      ["item_affinity", "running", null],
      ["outlet_item_scores", "failed", "Fail to queue."],
    ]);
  });
});
