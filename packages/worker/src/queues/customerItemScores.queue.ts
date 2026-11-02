import { CalculationJobData, lazyQueue } from "./createQueue.js";

export const CUSTOMER_ITEM_SCORES_QUEUE_NAME = "customer-item-scores";

const getQueue = lazyQueue<CalculationJobData>(CUSTOMER_ITEM_SCORES_QUEUE_NAME);

export async function queueCustomerItemScores(runId: string): Promise<void> {
  await getQueue().add(
    "customer_item_scores",
    { runId },
    { jobId: runId, removeOnComplete: true, removeOnFail: 1000 },
  );
}
