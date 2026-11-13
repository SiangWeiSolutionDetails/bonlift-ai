import { randomUUID } from "node:crypto";
import { closePool, getPool } from "@bonlift-ai/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createBrandFixture,
  createOutletFixture,
  createRunFixture,
  order,
  storeOrders,
} from "../testing/fixtures.js";
import { QueueByJobType, startBrandCalculations } from "./brandCalculations.js";
import { BrandRunOptions, SCHEDULED_RUN_OPTIONS } from "./scheduledRuns.repository.js";

const TIME_ZONE = "Asia/Singapore";
const MANUAL: BrandRunOptions = { triggerType: "manual", triggeredBy: "api", requireEnabledSchedule: false };

let yesterday: string;

async function daysAgo(days: number): Promise<string> {
  const result = await getPool().query(
    `SELECT ((now() AT TIME ZONE $1)::date - $2::int)::text AS day`,
    [TIME_ZONE, days],
  );
  return result.rows[0].day;
}

async function outletWithOrders(brandId: string): Promise<string> {
  const outletId = await createOutletFixture(getPool(), brandId);
  await storeOrders(getPool(), outletId, yesterday, [order("O1", `${yesterday}T12:00:00+08:00`, ["RICE"], "C1")]);
  return outletId;
}

async function disableSchedule(brandId: string) {
  await getPool().query(`UPDATE brand_calculation_schedules SET is_enabled = false WHERE brand_id = $1`, [brandId]);
}

async function runsFor(brandId: string) {
  const result = await getPool().query(
    `
    SELECT outlet_id, job_type, trigger_type, triggered_by, status, error
    FROM computation_runs
    WHERE brand_id = $1
    ORDER BY job_type, created_at;
    `,
    [brandId],
  );
  return result.rows;
}

function fakeQueues(overrides: Partial<QueueByJobType> = {}) {
  const queued: string[] = [];
  const record = async (runId: string) => {
    queued.push(runId);
  };
  const queues: QueueByJobType = {
    outlet_item_scores: record,
    customer_item_scores: record,
    item_affinity: record,
    ...overrides,
  };
  return { queues, queued };
}

beforeEach(async () => {
  yesterday = await daysAgo(1);
});

afterAll(async () => {
  await closePool();
});

describe("startBrandCalculations (integration)", () => {
  it("starts and queues every run of a manual Run all even with the schedule disabled", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool);
    const outletId = await outletWithOrders(brandId);
    await disableSchedule(brandId);
    const { queues, queued } = fakeQueues();

    const outcome = await startBrandCalculations(pool, queues, brandId, MANUAL);

    expect(outcome.brandStatus).toBe("active");
    expect(outcome.queued).toBe(3);
    expect(outcome.failedToQueue).toBe(0);
    expect(outcome.runs.map((run) => [run.jobType, run.outletId]).sort()).toEqual([
      ["customer_item_scores", null],
      ["item_affinity", null],
      ["outlet_item_scores", outletId],
    ]);
    expect(queued.sort()).toEqual(outcome.runs.map((run) => run.id).sort());
    const manual = { trigger_type: "manual", triggered_by: "api", status: "running", error: null };
    expect(await runsFor(brandId)).toEqual([
      { ...manual, outlet_id: null, job_type: "customer_item_scores" },
      { ...manual, outlet_id: null, job_type: "item_affinity" },
      { ...manual, outlet_id: outletId, job_type: "outlet_item_scores" },
    ]);
  });

  it("skips a scope that already has a running run", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool);
    const outletId = await outletWithOrders(brandId);
    await createRunFixture(pool, { brandId, outletId, jobType: "outlet_item_scores", from: yesterday, to: yesterday });

    const outcome = await startBrandCalculations(pool, fakeQueues().queues, brandId, MANUAL);

    expect(outcome.runs.map((run) => run.jobType).sort()).toEqual(["customer_item_scores", "item_affinity"]);
    expect(outcome.queued).toBe(2);
  });

  it("skips an outlet without order snapshots in its window", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool);
    const busy = await outletWithOrders(brandId);
    await createOutletFixture(pool, brandId);

    const outcome = await startBrandCalculations(pool, fakeQueues().queues, brandId, MANUAL);

    expect(outcome.runs.filter((run) => run.jobType === "outlet_item_scores").map((run) => run.outletId)).toEqual([busy]);
  });

  it("reports a deleted or unknown brand as not found and an inactive brand as inactive, creating nothing", async () => {
    const pool = getPool();
    const deleted = await createBrandFixture(pool, { deleted: true });
    await outletWithOrders(deleted);
    const inactive = await createBrandFixture(pool, { isActive: false });
    await outletWithOrders(inactive);
    const { queues } = fakeQueues();

    expect(await startBrandCalculations(pool, queues, deleted, MANUAL)).toEqual({
      brandStatus: "not_found",
      runs: [],
      queued: 0,
      failedToQueue: 0,
    });
    expect((await startBrandCalculations(pool, queues, randomUUID(), MANUAL)).brandStatus).toBe("not_found");
    expect(await startBrandCalculations(pool, queues, inactive, MANUAL)).toEqual({
      brandStatus: "inactive",
      runs: [],
      queued: 0,
      failedToQueue: 0,
    });
    expect(await runsFor(deleted)).toEqual([]);
    expect(await runsFor(inactive)).toEqual([]);
  });

  it("fails only the run that could not be queued", async () => {
    const pool = getPool();
    const brandId = await createBrandFixture(pool);
    await outletWithOrders(brandId);
    const { queues } = fakeQueues({
      item_affinity: async () => {
        throw new Error("Redis is down");
      },
    });

    const outcome = await startBrandCalculations(pool, queues, brandId, MANUAL);

    expect(outcome.queued).toBe(2);
    expect(outcome.failedToQueue).toBe(1);
    expect((await runsFor(brandId)).map((run) => [run.job_type, run.status, run.error])).toEqual([
      ["customer_item_scores", "running", null],
      ["item_affinity", "failed", "Fail to queue."],
      ["outlet_item_scores", "running", null],
    ]);
  });

  it("keeps the scheduled path: nothing for a disabled schedule, scheduler triggers otherwise", async () => {
    const pool = getPool();
    const disabled = await createBrandFixture(pool);
    await outletWithOrders(disabled);
    await disableSchedule(disabled);
    const enabled = await createBrandFixture(pool);
    await outletWithOrders(enabled);
    const { queues } = fakeQueues();

    const skipped = await startBrandCalculations(pool, queues, disabled, SCHEDULED_RUN_OPTIONS);
    const outcome = await startBrandCalculations(pool, queues, enabled, SCHEDULED_RUN_OPTIONS);

    expect(skipped).toEqual({ brandStatus: "active", runs: [], queued: 0, failedToQueue: 0 });
    expect(await runsFor(disabled)).toEqual([]);
    expect(outcome.queued).toBe(3);
    expect((await runsFor(enabled)).map((run) => [run.job_type, run.trigger_type, run.triggered_by])).toEqual([
      ["customer_item_scores", "scheduled", "scheduler"],
      ["item_affinity", "scheduled", "scheduler"],
      ["outlet_item_scores", "scheduled", "scheduler"],
    ]);
  });
});
