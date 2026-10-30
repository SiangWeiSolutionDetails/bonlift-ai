import { CalculationJobTypeSchemaType } from "@ai-services/contracts";
import { Pool } from "pg";
import { finishRun, loadRun, Run } from "./runs.repository.js";

export type Calculate = (pool: Pool, run: Run) => Promise<number>;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The run lifecycle shared by every calculation: load → check job type → calculate → finish.
export async function runCalculation(
  pool: Pool,
  runId: string,
  jobType: CalculationJobTypeSchemaType,
  calculate: Calculate,
): Promise<void> {
  const run = await loadRun(pool, runId);

  // Not running any more, e.g. a retried job for a finished run: nothing to do.
  if (!run) {
    console.log(`[${jobType}] run ${runId} is not running, skipped`);
    return;
  }

  try {
    if (run.jobType !== jobType) {
      throw new Error(`Run has job type ${run.jobType}, expected ${jobType}`);
    }

    const rowCount = await calculate(pool, run);
    await finishRun(pool, runId, { status: "succeeded", rowCount });
  } catch (error) {
    // Only the message is stored: stack traces would expose internals to the admin UI.
    await finishRun(pool, runId, {
      status: "failed",
      error: toErrorMessage(error),
    });
    throw error;
  }
}
