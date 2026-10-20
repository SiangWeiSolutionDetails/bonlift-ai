import { Job } from "bullmq";
import { CalculationJobData } from "../queues/createQueue.js";
import { OUTLET_ITEM_SCORES_CALCULATION_QUEUE_NAME } from "../queues/outletItemScoresCalculation.queue.js";

export async function processOutletItemScoresCalculation(
  job: Job<CalculationJobData>,
): Promise<void> {
  console.log(
    `[${OUTLET_ITEM_SCORES_CALCULATION_QUEUE_NAME}] received run ${job.data.runId}`,
  );
}
