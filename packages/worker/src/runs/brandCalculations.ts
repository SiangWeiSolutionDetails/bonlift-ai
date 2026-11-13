import { CalculationJobTypeSchemaType } from "@bonlift-ai/contracts";
import { Pool } from "pg";
import {
  BrandRun,
  BrandRunOptions,
  BrandStatus,
  createBrandRuns,
  failUnqueuedRun,
} from "./scheduledRuns.repository.js";

export type QueueByJobType = Record<CalculationJobTypeSchemaType, (runId: string) => Promise<void>>;

export interface BrandCalculationsOutcome {
  brandStatus: BrandStatus;
  runs: BrandRun[];
  queued: number;
  failedToQueue: number;
}

async function queueRun(pool: Pool, queues: QueueByJobType, run: BrandRun): Promise<void> {
  try {
    await queues[run.jobType](run.id);
  } catch (error) {
    await failUnqueuedRun(pool, run.id);
    throw error;
  }
}

// Shared by the nightly scheduler and the API's Run all.
export async function startBrandCalculations(
  pool: Pool,
  queues: QueueByJobType,
  brandId: string,
  options: BrandRunOptions,
): Promise<BrandCalculationsOutcome> {
  const { brandStatus, runs } = await createBrandRuns(pool, brandId, options);

  // One run failing to queue never stops the others.
  const results = await Promise.allSettled(runs.map((run) => queueRun(pool, queues, run)));
  const failedToQueue = results.filter((result) => result.status === "rejected").length;

  return { brandStatus, runs, queued: runs.length - failedToQueue, failedToQueue };
}
