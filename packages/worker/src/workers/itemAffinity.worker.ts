import { Worker } from "bullmq";
import { getRedisConnection } from "../connection.js";
import { processItemAffinity } from "../processors/itemAffinity.processor.js";
import { CalculationJobData } from "../queues/createQueue.js";
import { ITEM_AFFINITY_QUEUE_NAME } from "../queues/itemAffinity.queue.js";

export function startItemAffinityWorker(): Worker<CalculationJobData> {
  const worker = new Worker<CalculationJobData>(
    ITEM_AFFINITY_QUEUE_NAME,
    processItemAffinity,
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("ready", () => {
    console.log(`[${ITEM_AFFINITY_QUEUE_NAME}] listening`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[${ITEM_AFFINITY_QUEUE_NAME}] run ${job?.data?.runId} failed: ${error.message}`,
    );
  });

  worker.on("error", (error) => {
    console.error(`[${ITEM_AFFINITY_QUEUE_NAME}] error: `, error);
  });

  return worker;
}
