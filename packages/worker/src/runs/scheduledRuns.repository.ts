import {
  CALCULATION_ALGORITHM_VERSIONS,
  CalculationJobTypeSchemaType,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";

export interface ScheduledRun {
  id: string;
  jobType: CalculationJobTypeSchemaType;
}

export interface BrandScheduleState {
  isEnabled: boolean;
  runTime: string;
  timeZone: string;
}

export interface ScheduleOutcome {
  queued: number;
  failedToQueue: number;
}

// $1 = brand id, $2..$4 = algorithm versions (outlet, customer, affinity).
// One statement creates the brand's runs: one per live outlet for outlet item scores, one each for customer item
// scores and item affinity. Windows and time zone come from the brand's schedule row at run time, so changing a
// window needs no rescheduling. Windows are inclusive and end yesterday in the schedule's time zone. A disabled
// schedule or a non-live brand creates nothing. A scope with no order snapshots in its window is skipped, so idle
// outlets don't fill computation_runs with empty runs. A scope that already has a running run is skipped by the
// one-running indexes (ON CONFLICT names each partial index by its predicate).
const CREATE_SCHEDULED_RUNS_SQL = `
WITH
schedule AS (
  SELECT s.brand_id, s.outlet_window_days, s.customer_window_days, s.affinity_window_days,
         (now() AT TIME ZONE s.time_zone)::date AS today,
         (now() AT TIME ZONE s.time_zone)::date - 1 AS window_to
  FROM brand_calculation_schedules s
  JOIN brands b
    ON b.id = s.brand_id
  WHERE s.brand_id = $1
    AND s.is_enabled
    AND b.is_active
    AND b.deleted_at IS NULL
),
latest_config AS (
  SELECT DISTINCT ON (ccv.job_type) ccv.job_type, ccv.id
  FROM calculation_config_versions ccv
  WHERE ccv.brand_id = $1
  ORDER BY ccv.job_type, ccv.version DESC
),
outlet_runs AS (
  INSERT INTO computation_runs (
    brand_id, outlet_id, job_type, run_date, algorithm_version, calculation_config_version_id,
    input_window_from, input_window_to, trigger_type, triggered_by, status
  )
  SELECT s.brand_id, o.id, 'outlet_item_scores', s.today, $2, c.id,
         s.window_to - (s.outlet_window_days - 1), s.window_to, 'scheduled', 'scheduler', 'running'
  FROM schedule s
  JOIN outlets o
    ON o.brand_id = s.brand_id
  JOIN latest_config c
    ON c.job_type = 'outlet_item_scores'
  WHERE o.is_active
    AND o.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM order_snapshots os
      WHERE os.outlet_id = o.id
        AND os.order_date BETWEEN s.window_to - (s.outlet_window_days - 1) AND s.window_to
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
  SELECT s.brand_id, NULL, j.job_type, s.today, j.algorithm_version, c.id,
         s.window_to - (j.window_days - 1), s.window_to, 'scheduled', 'scheduler', 'running'
  FROM schedule s
  CROSS JOIN LATERAL (
    VALUES ('customer_item_scores', $3, s.customer_window_days),
           ('item_affinity', $4, s.affinity_window_days)
  ) AS j(job_type, algorithm_version, window_days)
  JOIN latest_config c
    ON c.job_type = j.job_type
  WHERE EXISTS (
    SELECT 1
    FROM outlets o
    JOIN order_snapshots os
      ON os.outlet_id = o.id
    WHERE o.brand_id = s.brand_id
      AND o.deleted_at IS NULL
      AND os.order_date BETWEEN s.window_to - (j.window_days - 1) AND s.window_to
  )
  ON CONFLICT (brand_id, job_type) WHERE status = 'running' AND outlet_id IS NULL DO NOTHING
  RETURNING id, job_type
)
SELECT id, job_type FROM outlet_runs
UNION ALL
SELECT id, job_type FROM brand_runs;
`;

export async function createScheduledRuns(pool: Pool, brandId: string): Promise<ScheduledRun[]> {
  const result = await pool.query(CREATE_SCHEDULED_RUNS_SQL, [
    brandId,
    CALCULATION_ALGORITHM_VERSIONS.outlet_item_scores,
    CALCULATION_ALGORITHM_VERSIONS.customer_item_scores,
    CALCULATION_ALGORITHM_VERSIONS.item_affinity,
  ]);

  return result.rows.map((row) => ({ id: row.id, jobType: row.job_type }));
}

// Null for an unknown or deleted brand.
export async function loadBrandSchedule(pool: Pool, brandId: string): Promise<BrandScheduleState | null> {
  const result = await pool.query(
    `
    SELECT s.is_enabled, to_char(s.run_time, 'HH24:MI') AS run_time, s.time_zone
    FROM brand_calculation_schedules s
    JOIN brands b
      ON b.id = s.brand_id
    WHERE s.brand_id = $1
      AND b.deleted_at IS NULL;
    `,
    [brandId],
  );
  const row = result.rows[0];
  return row ? { isEnabled: row.is_enabled, runTime: row.run_time, timeZone: row.time_zone } : null;
}

// Every brand's schedule, for reconciling BullMQ with the database. Deleted brands come back disabled.
export async function listBrandSchedules(
  pool: Pool,
): Promise<(BrandScheduleState & { brandId: string })[]> {
  const result = await pool.query(
    `
    SELECT s.brand_id, s.is_enabled AND b.deleted_at IS NULL AS is_enabled,
           to_char(s.run_time, 'HH24:MI') AS run_time, s.time_zone
    FROM brand_calculation_schedules s
    JOIN brands b
      ON b.id = s.brand_id;
    `,
  );
  return result.rows.map((row) => ({
    brandId: row.brand_id,
    isEnabled: row.is_enabled,
    runTime: row.run_time,
    timeZone: row.time_zone,
  }));
}

export async function recordScheduleSuccess(
  pool: Pool,
  brandId: string,
  outcome: ScheduleOutcome,
): Promise<void> {
  await pool.query(
    `
    UPDATE brand_calculation_schedules
    SET last_run_at = now(),
        last_queued = $2,
        last_failed_to_queue = $3,
        last_error = NULL
    WHERE brand_id = $1;
    `,
    [brandId, outcome.queued, outcome.failedToQueue],
  );
}

// The counts are left from the last successful run; only the time and the error say this one failed.
export async function recordScheduleFailure(pool: Pool, brandId: string, error: string): Promise<void> {
  await pool.query(
    `
    UPDATE brand_calculation_schedules
    SET last_run_at = now(),
        last_error = $2
    WHERE brand_id = $1;
    `,
    [brandId, error],
  );
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
