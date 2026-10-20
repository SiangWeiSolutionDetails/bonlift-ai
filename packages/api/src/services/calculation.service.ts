import {
  OutletItemScoresCalculationQuerySchema,
  OutletItemScoresCalculationQuerySchemaType,
  OutletItemScoresCalculationResponseSchemaType,
  CalculationTriggerTypeSchemaType,
  OutletItemScoresConfigSchemaType,
  OutletParamsSchema,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { assertValid, assertValidDate } from "../utils/validate.js";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "../errors.js";
import { isUniqueViolationOf } from "../utils/pgErrors.js";

export const OUTLET_ITEM_SCORES_ALGORITHM_VERSION = "p2-count";

export const OUTLET_ITEM_SCORES_CONFIG: OutletItemScoresConfigSchemaType = {};

async function insertRun(
  pool: Pool,
  outletId: string,
  query: OutletItemScoresCalculationQuerySchemaType,
  trigger: { type: CalculationTriggerTypeSchemaType; by: string },
): Promise<string> {
  try {
    const result = await pool.query(
      `
        WITH
        outlet AS (
            SELECT b.id AS brand_id, o.id, (b.is_active AND o.is_active) AS is_active
            FROM outlets o
            JOIN brands b
            ON b.id = o.brand_id
            WHERE o.id = $1
        ),
        created AS (
            INSERT INTO computation_runs (
                brand_id, 
                outlet_id, 
                job_type, 
                run_date, 
                algorithm_version, 
                config, 
                input_window_from, 
                input_window_to, 
                trigger_type, 
                triggered_by, 
                status
            )
            SELECT 
                o.brand_id, 
                o.id, 
                'outlet_item_scores', 
                current_date,
                $2, 
                $3, 
                $4::date, 
                $5::date, 
                $6,
                $7, 
                'running'
            FROM outlet o
            WHERE o.is_active IS TRUE 
            RETURNING id
        )
        SELECT o.is_active, c.id AS run_id
        FROM outlet o
        LEFT JOIN created c ON TRUE;
        `,
      [
        outletId,
        OUTLET_ITEM_SCORES_ALGORITHM_VERSION,
        JSON.stringify(OUTLET_ITEM_SCORES_CONFIG),
        query.from,
        query.to,
        trigger.type,
        trigger.by,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Outlet does not exist.");
    }
    if (!result.rows[0].is_active) {
      throw new ValidationError("Outlet is inactive.");
    }

    return result.rows[0].run_id;
  } catch (error) {
    if (isUniqueViolationOf(error, "computation_runs_one_running_key")) {
      throw new ConflictError(
        "A calculation for this outlet is already running",
      );
    }
    throw error;
  }
}

async function queueRun(
  pool: Pool,
  queue: (runId: string) => Promise<void>,
  runId: string,
) {
  try {
    await queue(runId);
  } catch (error) {
    await pool.query(
      `
        UPDATE computation_runs
        SET status = 'failed', error = 'Fail to queue.', finished_at = now(), updated_at = now()
        WHERE id = $1
        AND status = 'running'
        `,
      [runId],
    );
    throw new ServiceUnavailableError(
      "Calculation cannot be queued. Please try again.",
    );
  }
}

export async function startOutletItemScoresCalculation(
  pool: Pool,
  queue: (runId: string) => Promise<void>,
  outletId: string,
  query: OutletItemScoresCalculationQuerySchemaType,
  trigger: { type: CalculationTriggerTypeSchemaType; by: string },
): Promise<OutletItemScoresCalculationResponseSchemaType> {
  assertValid(OutletParamsSchema, { outletId });
  assertValid(OutletItemScoresCalculationQuerySchema, query);
  assertValidDate(query.from, "YYYYMMDD");
  assertValidDate(query.to, "YYYYMMDD");

  if (query.from >= query.to) {
    throw new ValidationError("from must be earlier than to.");
  }

  const runId = await insertRun(pool, outletId, query, trigger);
  await queueRun(pool, queue, runId);

  return {
    runId,
    outletId,
    jobType: "outlet_item_scores",
    from: query.from,
    to: query.to,
  };
}
