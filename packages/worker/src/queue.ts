import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.js";

export const CALCULATIONS_QUEUE_NAME = "calculations";

export interface CalculationJobData {
  runId: string;
}

let queue: Queue<CalculationJobData> | undefined;

function getCalculationsQueue(): Queue<CalculationJobData> {
  if (!queue) {
    queue = new Queue<CalculationJobData>(CALCULATIONS_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function queueCalculation(runId: string): Promise<void> {
  await getCalculationsQueue().add(
    "outlet_item_scores",
    { runId },
    { jobId: runId, removeOnComplete: true, removeOnFail: 1000 },
  );
}
