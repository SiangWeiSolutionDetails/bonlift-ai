import { Worker } from "bullmq";
import { getRedisConnection } from "../connection.js";
import { processSessionCleanup } from "../processors/sessionCleanup.processor.js";
import { SESSION_CLEANUP_QUEUE_NAME } from "../queues/sessionCleanup.queue.js";

export function startSessionCleanupWorker(): Worker<Record<string, never>, number> {
  const worker = new Worker<Record<string, never>, number>(
    SESSION_CLEANUP_QUEUE_NAME,
    processSessionCleanup,
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("ready", () => {
    console.log(`[${SESSION_CLEANUP_QUEUE_NAME}] listening`);
  });

  worker.on("completed", (_job, deleted) => {
    console.log(`[${SESSION_CLEANUP_QUEUE_NAME}] deleted ${deleted} sessions`);
  });

  worker.on("failed", (_job, error) => {
    console.error(`[${SESSION_CLEANUP_QUEUE_NAME}] failed: ${error.message}`);
  });

  worker.on("error", (error) => {
    console.error(`[${SESSION_CLEANUP_QUEUE_NAME}] error: `, error);
  });

  return worker;
}
