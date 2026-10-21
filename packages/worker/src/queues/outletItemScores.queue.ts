import { CalculationJobData, lazyQueue } from "./createQueue.js";

export const OUTLET_ITEM_SCORES_QUEUE_NAME =
  "outlet-item-scores";

const getQueue = lazyQueue<CalculationJobData>(
  OUTLET_ITEM_SCORES_QUEUE_NAME,
);

export async function queueOutletItemScores(
  runId: string,
): Promise<void> {
  await getQueue().add(
    "outlet_item_scores",
    { runId },
    { jobId: runId, removeOnComplete: true, removeOnFail: 1000 },
  );
}
