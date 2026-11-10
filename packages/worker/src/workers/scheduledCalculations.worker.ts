import { Worker } from "bullmq";
import { getRedisConnection } from "../connection.js";
import {
  processScheduledCalculations,
  ScheduledCalculationsSummary,
} from "../processors/scheduledCalculations.processor.js";
import {
  SCHEDULED_CALCULATIONS_QUEUE_NAME,
  ScheduledCalculationJobData,
} from "../queues/scheduledCalculations.queue.js";

export function startScheduledCalculationsWorker(): Worker<
  ScheduledCalculationJobData,
  ScheduledCalculationsSummary
> {
  const worker = new Worker<ScheduledCalculationJobData, ScheduledCalculationsSummary>(
    SCHEDULED_CALCULATIONS_QUEUE_NAME,
    processScheduledCalculations,
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("ready", () => {
    console.log(`[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] listening`);
  });

  worker.on("completed", (job, summary) => {
    const brandId = job.data.brandId;
    console.log(
      summary.skipped === "disabled"
        ? `[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] brand ${brandId} schedule is off or deleted, removed it`
        : summary.skipped === "timing_changed"
          ? `[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] brand ${brandId} fired with an outdated time, rescheduled it`
          : `[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] brand ${brandId}: queued ${summary.queued} runs, ${summary.failedToQueue} failed to queue`,
    );
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] brand ${job?.data?.brandId} failed: ${error.message}`,
    );
  });

  worker.on("error", (error) => {
    console.error(`[${SCHEDULED_CALCULATIONS_QUEUE_NAME}] error: `, error);
  });

  return worker;
}
