import { lazyQueue } from "./createQueue.js";

export const SCHEDULED_CALCULATIONS_QUEUE_NAME = "scheduled-calculations";

const SCHEDULER_ID = "nightly-calculations";

export interface ScheduleOptions {
  pattern: string;
  timeZone: string;
}

const getQueue = lazyQueue<Record<string, never>>(SCHEDULED_CALCULATIONS_QUEUE_NAME);

// Upsert, so every worker start (and every replica) converges on one schedule instead of adding another.
export async function registerScheduledCalculations(options: ScheduleOptions): Promise<void> {
  await getQueue().upsertJobScheduler(
    SCHEDULER_ID,
    { pattern: options.pattern, tz: options.timeZone },
    {
      name: "scheduled_calculations",
      data: {},
      // A DB error at run time retries instead of skipping the night. Re-running is safe: scopes already running are skipped.
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    },
  );
}
