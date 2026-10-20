import { Worker } from "bullmq";
import { getRedisConnection } from "../connection.js";
import { processOutletItemScoresCalculation } from "../processors/outletItemScoresCalculation.processor.js";
import { CalculationJobData } from "../queues/createQueue.js";
import { OUTLET_ITEM_SCORES_CALCULATION_QUEUE_NAME } from "../queues/outletItemScoresCalculation.queue.js";

export function startOutletItemScoresCalculationWorker(): Worker<CalculationJobData> {
  const worker = new Worker<CalculationJobData>(
    OUTLET_ITEM_SCORES_CALCULATION_QUEUE_NAME,
    processOutletItemScoresCalculation,
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("ready", () => {
    console.log(`[${OUTLET_ITEM_SCORES_CALCULATION_QUEUE_NAME}] listening`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[${OUTLET_ITEM_SCORES_CALCULATION_QUEUE_NAME}] run ${job?.data?.runId} failed: ${error.message}`,
    );
  });

  worker.on("error", (error) => {
    console.error(
      `[${OUTLET_ITEM_SCORES_CALCULATION_QUEUE_NAME}] error: `,
      error,
    );
  });

  return worker;
}
