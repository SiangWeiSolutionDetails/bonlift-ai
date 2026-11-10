import { CalculationJobTypeSchemaType } from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { Job } from "bullmq";
import { Pool } from "pg";
import { queueCustomerItemScores } from "../queues/customerItemScores.queue.js";
import { queueItemAffinity } from "../queues/itemAffinity.queue.js";
import { queueOutletItemScores } from "../queues/outletItemScores.queue.js";
import {
  BrandScheduleTiming,
  removeBrandCalculationSchedule,
  ScheduledCalculationJobData,
  syncBrandCalculationSchedule,
} from "../queues/scheduledCalculations.queue.js";
import {
  createScheduledRuns,
  failUnqueuedRun,
  loadBrandSchedule,
  recordScheduleFailure,
  recordScheduleSuccess,
  ScheduleOutcome,
} from "../runs/scheduledRuns.repository.js";

export type QueueByJobType = Record<CalculationJobTypeSchemaType, (runId: string) => Promise<void>>;

export interface ScheduledCalculationsDeps {
  queues: QueueByJobType;
  removeSchedule: (brandId: string) => Promise<void>;
  syncSchedule: (brandId: string, timing: BrandScheduleTiming) => Promise<void>;
}

// The timing the firing scheduler was built from; missing on schedulers written before it was put on the job.
export type FiredTiming = Pick<ScheduledCalculationJobData, "runTime" | "timeZone">;

export type ScheduledCalculationsSummary = ScheduleOutcome & {
  skipped: false | "disabled" | "timing_changed";
};

const DEPS: ScheduledCalculationsDeps = {
  queues: {
    outlet_item_scores: queueOutletItemScores,
    customer_item_scores: queueCustomerItemScores,
    item_affinity: queueItemAffinity,
  },
  removeSchedule: removeBrandCalculationSchedule,
  syncSchedule: syncBrandCalculationSchedule,
};

async function queueRuns(pool: Pool, queues: QueueByJobType, brandId: string): Promise<ScheduleOutcome> {
  const runs = await createScheduledRuns(pool, brandId);

  // One run failing to queue never stops the others.
  const results = await Promise.allSettled(
    runs.map(async (run) => {
      try {
        await queues[run.jobType](run.id);
      } catch (error) {
        await failUnqueuedRun(pool, run.id);
        throw error;
      }
    }),
  );
  const failedToQueue = results.filter((result) => result.status === "rejected").length;

  return { queued: runs.length - failedToQueue, failedToQueue };
}

function isStale(fired: FiredTiming, current: BrandScheduleTiming): boolean {
  return (
    (fired.runTime !== undefined && fired.runTime !== current.runTime) ||
    (fired.timeZone !== undefined && fired.timeZone !== current.timeZone)
  );
}

// A scheduler left behind for a deleted or disabled brand (e.g. a tenant delete, or a missed sync) removes itself
// and does nothing. A scheduler built from an older timing (a startup reconcile racing a PATCH) is rebuilt from the
// row and this firing is skipped without recording anything: the rebuilt scheduler runs at the brand's real time, and
// the status panel keeps showing the last real run. Otherwise the outcome, or the error, is recorded for the admin page.
export async function queueScheduledCalculations(
  pool: Pool,
  deps: ScheduledCalculationsDeps,
  brandId: string,
  fired: FiredTiming = {},
): Promise<ScheduledCalculationsSummary> {
  const schedule = await loadBrandSchedule(pool, brandId);
  if (!schedule?.isEnabled) {
    await deps.removeSchedule(brandId);
    return { queued: 0, failedToQueue: 0, skipped: "disabled" };
  }
  if (isStale(fired, schedule)) {
    await deps.syncSchedule(brandId, schedule);
    return { queued: 0, failedToQueue: 0, skipped: "timing_changed" };
  }

  try {
    const outcome = await queueRuns(pool, deps.queues, brandId);
    await recordScheduleSuccess(pool, brandId, outcome);
    return { ...outcome, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Best effort: when the DB itself is down this fails too, and the job's own retry and log carry the error.
    await recordScheduleFailure(pool, brandId, message).catch(() => undefined);
    throw error;
  }
}

export async function processScheduledCalculations(
  job: Job<ScheduledCalculationJobData>,
): Promise<ScheduledCalculationsSummary> {
  const { brandId, runTime, timeZone } = job.data;
  return queueScheduledCalculations(getPool(), DEPS, brandId, { runTime, timeZone });
}
