import {
  BrandParamsSchema,
  CalculationTriggerTypeSchemaType,
  ItemAffinityCalculationQuerySchema,
  ItemAffinityCalculationQuerySchemaType,
  ItemAffinityCalculationResponseSchemaType,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { isUniqueViolationOf } from "../utils/pgErrors.js";
import { assertValid, assertValidDate } from "../utils/validate.js";
import { queueRun } from "./calculation.service.js";

export const ITEM_AFFINITY_CALCULATION_ALGORITHM_VERSION = "p4-order-lift";

async function insertRun(
  pool: Pool,
  brandId: string,
  query: ItemAffinityCalculationQuerySchemaType,
  trigger: { type: CalculationTriggerTypeSchemaType; by: string },
): Promise<string> {
  try {
    const result = await pool.query(
      `
        WITH
        brand AS (
            SELECT
              b.id,
              b.is_active,
              v.id AS calculation_config_version_id
            FROM brands b
            LEFT JOIN LATERAL (
              SELECT ccv.id
              FROM calculation_config_versions ccv
              WHERE ccv.brand_id = b.id
              AND ccv.job_type = 'item_affinity'
              ORDER BY ccv.version DESC
              LIMIT 1
            ) v on TRUE
            WHERE b.id = $1
            AND b.deleted_at IS NULL
        ),
        created AS (
            INSERT INTO computation_runs (
                brand_id,
                outlet_id,
                job_type,
                run_date,
                algorithm_version,
                calculation_config_version_id,
                input_window_from,
                input_window_to,
                trigger_type,
                triggered_by,
                status
            )
            SELECT
                b.id,
                NULL,
                'item_affinity',
                current_date,
                $2,
                b.calculation_config_version_id,
                $3::date,
                $4::date,
                $5,
                $6,
                'running'
            FROM brand b
            WHERE b.is_active IS TRUE
            RETURNING id
        )
        SELECT b.is_active, c.id AS run_id
        FROM brand b
        LEFT JOIN created c ON TRUE;
        `,
      [
        brandId,
        ITEM_AFFINITY_CALCULATION_ALGORITHM_VERSION,
        query.from,
        query.to,
        trigger.type,
        trigger.by,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Brand does not exist.");
    }
    if (!result.rows[0].is_active) {
      throw new ValidationError("Brand is inactive.");
    }

    return result.rows[0].run_id;
  } catch (error) {
    if (isUniqueViolationOf(error, "computation_runs_one_running_brand_key")) {
      throw new ConflictError(
        "A calculation for this brand is already running",
      );
    }
    throw error;
  }
}

export async function startItemAffinityCalculation(
  pool: Pool,
  queue: (runId: string) => Promise<void>,
  brandId: string,
  query: ItemAffinityCalculationQuerySchemaType,
  trigger: { type: CalculationTriggerTypeSchemaType; by: string },
): Promise<ItemAffinityCalculationResponseSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(ItemAffinityCalculationQuerySchema, query);
  assertValidDate(query.from, "YYYYMMDD");
  assertValidDate(query.to, "YYYYMMDD");

  if (query.from >= query.to) {
    throw new ValidationError("from must be earlier than to.");
  }

  const runId = await insertRun(pool, brandId, query, trigger);
  await queueRun(pool, queue, runId);

  return {
    runId,
    brandId,
    jobType: "item_affinity",
    from: query.from,
    to: query.to,
  };
}
