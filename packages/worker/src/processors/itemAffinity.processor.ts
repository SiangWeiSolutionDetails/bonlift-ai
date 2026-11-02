import { getPool } from "@ai-services/db";
import { Job } from "bullmq";
import { calculateItemAffinity } from "../calculations/itemAffinity.js";
import { CalculationJobData } from "../queues/createQueue.js";
import { runCalculation } from "../runs/runCalculation.js";

export async function processItemAffinity(
  job: Job<CalculationJobData>,
): Promise<void> {
  await runCalculation(
    getPool(),
    job.data.runId,
    "item_affinity",
    calculateItemAffinity,
  );
}
