import { CalculationJobData, lazyQueue } from "./createQueue.js";

export const ITEM_AFFINITY_QUEUE_NAME = "item-affinity";

const getQueue = lazyQueue<CalculationJobData>(ITEM_AFFINITY_QUEUE_NAME);

export async function queueItemAffinity(runId: string): Promise<void> {
  await getQueue().add(
    "item_affinity",
    { runId },
    { jobId: runId, removeOnComplete: true, removeOnFail: 1000 },
  );
}
