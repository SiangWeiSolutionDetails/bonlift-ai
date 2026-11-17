import { getSchedulerRedisConnection } from "../connection.js";
import { lazyQueue } from "./createQueue.js";

export const SESSION_CLEANUP_QUEUE_NAME = "session-cleanup";

const getQueue = lazyQueue<Record<string, never>>(
  SESSION_CLEANUP_QUEUE_NAME,
  getSchedulerRedisConnection,
  (queue) => queue.on("error", () => undefined),
);

// Upsert, so restarts and replicas converge on one hourly scheduler.
export async function registerSessionCleanupSchedule(): Promise<void> {
  await getQueue().upsertJobScheduler(
    SESSION_CLEANUP_QUEUE_NAME,
    { pattern: "0 * * * *" },
    {
      name: "session_cleanup",
      data: {},
      opts: { removeOnComplete: 24, removeOnFail: 100 },
    },
  );
}
