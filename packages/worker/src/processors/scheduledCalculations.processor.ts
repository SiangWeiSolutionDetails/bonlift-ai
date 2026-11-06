import { CalculationJobTypeSchemaType } from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { Pool } from "pg";
import { queueCustomerItemScores } from "../queues/customerItemScores.queue.js";
import { queueItemAffinity } from "../queues/itemAffinity.queue.js";
import { queueOutletItemScores } from "../queues/outletItemScores.queue.js";
import {
  createScheduledRuns,
  failUnqueuedRun,
  ScheduledRunWindows,
} from "../runs/scheduledRuns.repository.js";

export type QueueByJobType = Record<CalculationJobTypeSchemaType, (runId: string) => Promise<void>>;

export interface ScheduledCalculationsSummary {
  queued: number;
  failedToQueue: number;
}

const QUEUE_BY_JOB_TYPE: QueueByJobType = {
  outlet_item_scores: queueOutletItemScores,
  customer_item_scores: queueCustomerItemScores,
  item_affinity: queueItemAffinity,
};

// Scopes already running were skipped when the runs were created. One run failing to queue never stops the others.
export async function queueScheduledCalculations(
  pool: Pool,
  queues: QueueByJobType,
  windows: ScheduledRunWindows,
): Promise<ScheduledCalculationsSummary> {
  const runs = await createScheduledRuns(pool, windows);

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

export function processScheduledCalculations(
  windows: ScheduledRunWindows,
): () => Promise<ScheduledCalculationsSummary> {
  return () => queueScheduledCalculations(getPool(), QUEUE_BY_JOB_TYPE, windows);
}
