import { getPool } from "@bonlift-ai/db";
import { Job } from "bullmq";
import { calculateCustomerItemScores } from "../calculations/customerItemScores.js";
import { CalculationJobData } from "../queues/createQueue.js";
import { runCalculation } from "../runs/runCalculation.js";

export async function processCustomerItemScores(
  job: Job<CalculationJobData>,
): Promise<void> {
  await runCalculation(
    getPool(),
    job.data.runId,
    "customer_item_scores",
    calculateCustomerItemScores,
  );
}
