import { Worker } from "bullmq";
import { getRedisConnection } from "../connection.js";
import { processScheduledCalculations } from "../processors/scheduledCalculations.processor.js";
import { SCHEDULED_CALCULATIONS_QUEUE_NAME } from "../queues/scheduledCalculations.queue.js";
import { ScheduledRunWindows } from "../runs/scheduledRuns.repository.js";

export function startScheduledCalculationsWorker(windows: ScheduledRunWindows): Worker {
  const worker = new Worker(
    SCHEDULED_CALCULATIONS_QUEUE_NAME,
    processScheduledCalculations(windows),
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("ready", () => {
    console.log(`[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] listening`);
  });

  worker.on("completed", (_job, summary) => {
    console.log(
      `[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] queued ${summary.queued} runs, ${summary.failedToQueue} failed to queue`,
    );
  });

  worker.on("failed", (_job, error) => {
    console.error(`[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] failed: ${error.message}`);
  });

  worker.on("error", (error) => {
    console.error(`[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] error: `, error);
  });

  return worker;
}
