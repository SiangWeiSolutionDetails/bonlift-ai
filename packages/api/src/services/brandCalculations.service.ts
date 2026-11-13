import {
  BrandCalculationsStartResponseSchemaType,
  BrandParamsSchema,
  CalculationTriggerTypeSchemaType,
} from "@bonlift-ai/contracts";
import { BrandCalculationsOutcome, QueueByJobType, startBrandCalculations } from "@bonlift-ai/worker";
import { Pool } from "pg";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "../errors.js";
import { assertValid } from "../utils/validate.js";

function assertStarted(outcome: BrandCalculationsOutcome): void {
  if (outcome.brandStatus === "not_found") {
    throw new NotFoundError("Brand does not exist.");
  }
  if (outcome.brandStatus === "inactive") {
    throw new ValidationError("Brand is inactive.");
  }
  if (outcome.runs.length > 0 && outcome.queued === 0) {
    throw new ServiceUnavailableError("Calculations cannot be queued. Please try again.");
  }
}

// Scopes already running or without orders in their window are skipped, so an empty runs list is not an error.
export async function startAllBrandCalculations(
  pool: Pool,
  queues: QueueByJobType,
  brandId: string,
  trigger: { type: CalculationTriggerTypeSchemaType; by: string },
): Promise<BrandCalculationsStartResponseSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  const outcome = await startBrandCalculations(pool, queues, brandId, {
    triggerType: trigger.type,
    triggeredBy: trigger.by,
    requireEnabledSchedule: false,
  });
  assertStarted(outcome);

  return {
    brandId,
    runs: outcome.runs.map((run) => ({ runId: run.id, jobType: run.jobType, outletId: run.outletId })),
    queued: outcome.queued,
    failedToQueue: outcome.failedToQueue,
  };
}
