import {
  CALCULATION_ALGORITHM_VERSIONS,
  CalculationJobTypeSchemaType,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";

export interface ScheduledRunWindows {
  timeZone: string;
  outletWindowDays: number;
  brandWindowDays: number;
}

export interface ScheduledRun {
  id: string;
  jobType: CalculationJobTypeSchemaType;
}

// $1 = time zone, $2 = outlet window days, $3 = brand window days, $4..$6 = algorithm versions (outlet, customer, affinity).
// One statement creates every run: one per live outlet for outlet item scores, one per live brand for customer item
// scores and item affinity. Windows are inclusive and end yesterday in the schedule's time zone. A scope with no order
// snapshots in its window is skipped, so idle outlets don't fill computation_runs with empty runs. A scope that already
// has a running run is skipped by the one-running indexes (ON CONFLICT names each partial index by its predicate).
const CREATE_SCHEDULED_RUNS_SQL = `
WITH
run_day AS (
  SELECT (now() AT TIME ZONE $1)::date AS today,
         (now() AT TIME ZONE $1)::date - 1 AS window_to
),
latest_config AS (
  SELECT DISTINCT ON (ccv.brand_id, ccv.job_type) ccv.brand_id, ccv.job_type, ccv.id
  FROM calculation_config_versions ccv
  ORDER BY ccv.brand_id, ccv.job_type, ccv.version DESC
),
live_brands AS (
  SELECT b.id
  FROM brands b
  WHERE b.is_active
    AND b.deleted_at IS NULL
),
outlet_runs AS (
  INSERT INTO computation_runs (
    brand_id, outlet_id, job_type, run_date, algorithm_version, calculation_config_version_id,
    input_window_from, input_window_to, trigger_type, triggered_by, status
  )
  SELECT o.brand_id, o.id, 'outlet_item_scores', d.today, $4, c.id,
         d.window_to - ($2::int - 1), d.window_to, 'scheduled', 'scheduler', 'running'
  FROM outlets o
  JOIN live_brands b
    ON b.id = o.brand_id
  JOIN latest_config c
    ON c.brand_id = o.brand_id
   AND c.job_type = 'outlet_item_scores'
  CROSS JOIN run_day d
  WHERE o.is_active
    AND o.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM order_snapshots os
      WHERE os.outlet_id = o.id
        AND os.order_date BETWEEN d.window_to - ($2::int - 1) AND d.window_to
    )
  ON CONFLICT (outlet_id, job_type) WHERE status = 'running' DO NOTHING
  RETURNING id, job_type
),
-- Inactive outlets count here, as in the brand-level calculations themselves; deleted ones do not.
brand_runs AS (
  INSERT INTO computation_runs (
    brand_id, outlet_id, job_type, run_date, algorithm_version, calculation_config_version_id,
    input_window_from, input_window_to, trigger_type, triggered_by, status
  )
  SELECT b.id, NULL, j.job_type, d.today, j.algorithm_version, c.id,
         d.window_to - ($3::int - 1), d.window_to, 'scheduled', 'scheduler', 'running'
  FROM live_brands b
  CROSS JOIN (VALUES ('customer_item_scores', $5), ('item_affinity', $6)) AS j(job_type, algorithm_version)
  JOIN latest_config c
    ON c.brand_id = b.id
   AND c.job_type = j.job_type
  CROSS JOIN run_day d
  WHERE EXISTS (
    SELECT 1
    FROM outlets o
    JOIN order_snapshots os
      ON os.outlet_id = o.id
    WHERE o.brand_id = b.id
      AND o.deleted_at IS NULL
      AND os.order_date BETWEEN d.window_to - ($3::int - 1) AND d.window_to
  )
  ON CONFLICT (brand_id, job_type) WHERE status = 'running' AND outlet_id IS NULL DO NOTHING
  RETURNING id, job_type
)
SELECT id, job_type FROM outlet_runs
UNION ALL
SELECT id, job_type FROM brand_runs;
`;

export async function createScheduledRuns(
  pool: Pool,
  windows: ScheduledRunWindows,
): Promise<ScheduledRun[]> {
  const result = await pool.query(CREATE_SCHEDULED_RUNS_SQL, [
    windows.timeZone,
    windows.outletWindowDays,
    windows.brandWindowDays,
    CALCULATION_ALGORITHM_VERSIONS.outlet_item_scores,
    CALCULATION_ALGORITHM_VERSIONS.customer_item_scores,
    CALCULATION_ALGORITHM_VERSIONS.item_affinity,
  ]);

  return result.rows.map((row) => ({ id: row.id, jobType: row.job_type }));
}

// Same as the API's manual path: a run whose job never reached the queue would otherwise stay running and block the
// next run for its scope.
export async function failUnqueuedRun(pool: Pool, runId: string): Promise<void> {
  await pool.query(
    `
    UPDATE computation_runs
    SET status = 'failed',
        error = 'Fail to queue.',
        finished_at = now(),
        updated_at = now()
    WHERE id = $1
      AND status = 'running';
    `,
    [runId],
  );
}
