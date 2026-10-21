import { Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection.js";
import { CalculationJobData } from "../queues/createQueue.js";
import { OUTLET_ITEM_SCORES_QUEUE_NAME } from "../queues/outletItemScores.queue.js";

async function processOutletItemScores(
  job: Job<CalculationJobData>,
): Promise<void> {
  console.log(
    `[${OUTLET_ITEM_SCORES_QUEUE_NAME}] received run ${job.data.runId}`,
  );
}
export function startOutletItemScoresWorker(): Worker<CalculationJobData> {
  const worker = new Worker<CalculationJobData>(
    OUTLET_ITEM_SCORES_QUEUE_NAME,
    processOutletItemScores,
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("ready", () => {
    console.log(`[${OUTLET_ITEM_SCORES_QUEUE_NAME}] listening`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[${OUTLET_ITEM_SCORES_QUEUE_NAME}] run ${job?.data?.runId} failed: ${error.message}`,
    );
  });

  worker.on("error", (error) => {
    console.error(
      `[${OUTLET_ITEM_SCORES_QUEUE_NAME}] error: `,
      error,
    );
  });

  return worker;
}
