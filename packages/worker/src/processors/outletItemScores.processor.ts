import { getPool } from "@bonlift-ai/db";
import { Job } from "bullmq";
import { calculateOutletItemScores } from "../calculations/outletItemScores.js";
import { CalculationJobData } from "../queues/createQueue.js";
import { runCalculation } from "../runs/runCalculation.js";

export async function processOutletItemScores(
  job: Job<CalculationJobData>,
): Promise<void> {
  await runCalculation(
    getPool(),
    job.data.runId,
    "outlet_item_scores",
    calculateOutletItemScores,
  );
}
