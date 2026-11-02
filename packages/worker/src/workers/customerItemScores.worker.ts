import { Worker } from "bullmq";
import { getRedisConnection } from "../connection.js";
import { processCustomerItemScores } from "../processors/customerItemScores.processor.js";
import { CalculationJobData } from "../queues/createQueue.js";
import { CUSTOMER_ITEM_SCORES_QUEUE_NAME } from "../queues/customerItemScores.queue.js";

export function startCustomerItemScoresWorker(): Worker<CalculationJobData> {
  const worker = new Worker<CalculationJobData>(
    CUSTOMER_ITEM_SCORES_QUEUE_NAME,
    processCustomerItemScores,
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("ready", () => {
    console.log(`[${CUSTOMER_ITEM_SCORES_QUEUE_NAME}] listening`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[${CUSTOMER_ITEM_SCORES_QUEUE_NAME}] run ${job?.data?.runId} failed: ${error.message}`,
    );
  });

  worker.on("error", (error) => {
    console.error(`[${CUSTOMER_ITEM_SCORES_QUEUE_NAME}] error: `, error);
  });

  return worker;
}
