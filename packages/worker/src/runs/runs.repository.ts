import { CalculationJobTypeSchemaType } from "@ai-services/contracts";
import { Pool } from "pg";

export interface Run {
  id: string;
  outletId: string | null;
  jobType: CalculationJobTypeSchemaType;
  calculationConfigVersionId: string;
  from: string;
  to: string;
}

export type RunOutcome =
  | { status: "succeeded"; rowCount: number }
  | { status: "failed"; error: string };

const RUN_COLUMNS =
  "id, outlet_id, job_type, calculation_config_version_id, input_window_from::text AS input_window_from, input_window_to::text AS input_window_to";

function mapRunRow(row: any): Run {
  return {
    id: row.id,
    outletId: row.outlet_id,
    jobType: row.job_type,
    calculationConfigVersionId: row.calculation_config_version_id,
    from: row.input_window_from,
    to: row.input_window_to,
  };
}

export async function loadRun(pool: Pool, runId: string): Promise<Run | null> {
  const result = await pool.query(
    `
    SELECT ${RUN_COLUMNS}
    FROM computation_runs
    WHERE id = $1
    AND status = 'running';
    `,
    [runId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRunRow(result.rows[0]);
}

export async function finishRun(
  pool: Pool,
  runId: string,
  outcome: RunOutcome,
): Promise<void> {
  const rowCount = outcome.status === "succeeded" ? outcome.rowCount : null;
  const error = outcome.status === "failed" ? outcome.error : null;

  await pool.query(
    `
    UPDATE computation_runs
    SET 
      status = $2,
      row_count = $3,
      error = $4,
      finished_at = now(),
      updated_at = now()
    WHERE id = $1
    AND status = 'running'
    `,
    [runId, outcome.status, rowCount, error],
  );
}
