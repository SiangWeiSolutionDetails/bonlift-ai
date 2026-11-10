import { getSchedulerRedisConnection } from "../connection.js";
import { lazyQueue } from "./createQueue.js";

export const SCHEDULED_CALCULATIONS_QUEUE_NAME = "scheduled-calculations";

// The single global scheduler used before schedules moved to each brand; removed on worker start.
const LEGACY_SCHEDULER_ID = "nightly-calculations";

// An admin request waits at most this long for Redis before its schedule write fails (and the API returns 503).
const REDIS_TIMEOUT_MS = 5_000;

export interface BrandScheduleTiming {
  isEnabled: boolean;
  // Local "HH:MM" (seconds, if any, are ignored)
  runTime: string;
  timeZone: string;
}

// The timing the scheduler was built from rides on each job, so the processor can tell a stale scheduler (one
// written from an older row, e.g. by a reconcile racing a PATCH) from the brand's current schedule.
export interface ScheduledCalculationJobData {
  brandId: string;
  runTime?: string;
  timeZone?: string;
}

// Connection errors surface as the rejected schedule write; the listener only stops them being printed per retry.
const getQueue = lazyQueue<ScheduledCalculationJobData>(
  SCHEDULED_CALCULATIONS_QUEUE_NAME,
  getSchedulerRedisConnection,
  (queue) => queue.on("error", () => undefined),
);

function schedulerId(brandId: string): string {
  return `calculation-schedule:${brandId}`;
}

export function toDailyCron(runTime: string): string {
  const [hours, minutes] = runTime.split(":").map(Number);
  return `${minutes} ${hours} * * *`;
}

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis did not answer within ${REDIS_TIMEOUT_MS} ms (${what})`)), REDIS_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Waits for the connection first and only then sends the command: a write that timed out while Redis was down is
// never sent later when it comes back, so a rolled-back PATCH cannot reappear in BullMQ.
async function runOnQueue<T>(what: string, command: (queue: ReturnType<typeof getQueue>) => Promise<T>): Promise<T> {
  const queue = getQueue();
  await withTimeout(queue.waitUntilReady(), what);
  return withTimeout(command(queue), what);
}

// Upsert, so the API, every worker start and every replica converge on one scheduler per brand. Disabled removes it.
export async function syncBrandCalculationSchedule(
  brandId: string,
  timing: BrandScheduleTiming,
): Promise<void> {
  if (!timing.isEnabled) {
    await removeBrandCalculationSchedule(brandId);
    return;
  }

  await runOnQueue("upsert schedule", (queue) =>
    queue.upsertJobScheduler(
      schedulerId(brandId),
      { pattern: toDailyCron(timing.runTime), tz: timing.timeZone },
      {
        name: "scheduled_calculations",
        data: { brandId, runTime: timing.runTime, timeZone: timing.timeZone },
        // A DB error at run time retries instead of skipping the night. Re-running is safe: scopes already running are skipped.
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      },
    ),
  );
}

export async function removeBrandCalculationSchedule(brandId: string): Promise<void> {
  await runOnQueue("remove schedule", (queue) => queue.removeJobScheduler(schedulerId(brandId)));
}

export async function removeLegacyCalculationSchedule(): Promise<void> {
  await runOnQueue("remove legacy schedule", (queue) => queue.removeJobScheduler(LEGACY_SCHEDULER_ID));
}
