import {
  BrandCalculationScheduleRecordSchemaType,
  BrandParamsSchema,
  UpdateBrandCalculationScheduleBodySchema,
  UpdateBrandCalculationScheduleBodySchemaType,
} from "@bonlift-ai/contracts";
import { Pool, PoolClient } from "pg";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "../errors.js";
import { withTransaction } from "../utils/transaction.js";
import { assertValid } from "../utils/validate.js";

export interface ScheduleTiming {
  isEnabled: boolean;
  runTime: string;
  timeZone: string;
}

// Writes the brand's BullMQ scheduler (worker's syncBrandCalculationSchedule); injected so tests need no Redis.
export type SyncSchedule = (brandId: string, timing: ScheduleTiming) => Promise<void>;

// nextRunAt: today's run time in the schedule's zone if it is still ahead, else tomorrow's; null while disabled.
// On a DST fall-back day a local time inside the repeated hour happens twice: AT TIME ZONE picks the second, the
// scheduler (cron-parser) fires at the first, so an hour earlier is taken when it reads as the same local time.
// A local time skipped by spring-forward resolves to the same instant in both.
const SCHEDULE_COLUMNS = `
  s.brand_id,
  s.is_enabled,
  to_char(s.run_time, 'HH24:MI') AS run_time,
  s.time_zone,
  s.outlet_window_days,
  s.customer_window_days,
  s.affinity_window_days,
  s.updated_by,
  s.updated_at,
  CASE WHEN s.is_enabled THEN (
    SELECT CASE WHEN ((n.at - interval '1 hour') AT TIME ZONE s.time_zone) = n.local_at
                THEN n.at - interval '1 hour'
                ELSE n.at
           END
    FROM (
      SELECT l.local_at, l.local_at AT TIME ZONE s.time_zone AS at
      FROM (
        SELECT CASE WHEN (now() AT TIME ZONE s.time_zone)::time < s.run_time
                    THEN (now() AT TIME ZONE s.time_zone)::date
                    ELSE (now() AT TIME ZONE s.time_zone)::date + 1
               END + s.run_time AS local_at
      ) l
    ) n
  ) END AS next_run_at,
  s.last_run_at,
  s.last_queued,
  s.last_failed_to_queue,
  s.last_error`;

function mapScheduleRow(row: any): BrandCalculationScheduleRecordSchemaType {
  return {
    brandId: row.brand_id,
    isEnabled: row.is_enabled,
    runTime: row.run_time,
    timeZone: row.time_zone,
    outletWindowDays: row.outlet_window_days,
    customerWindowDays: row.customer_window_days,
    affinityWindowDays: row.affinity_window_days,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
    nextRunAt: row.next_run_at?.toISOString() ?? null,
    lastRunAt: row.last_run_at?.toISOString() ?? null,
    lastQueued: row.last_queued,
    lastFailedToQueue: row.last_failed_to_queue,
    lastError: row.last_error,
  };
}

function toTiming(schedule: BrandCalculationScheduleRecordSchemaType): ScheduleTiming {
  return { isEnabled: schedule.isEnabled, runTime: schedule.runTime, timeZone: schedule.timeZone };
}

async function selectSchedule(
  db: Pool | PoolClient,
  brandId: string,
): Promise<BrandCalculationScheduleRecordSchemaType> {
  const result = await db.query(
    `
    SELECT ${SCHEDULE_COLUMNS}
    FROM brand_calculation_schedules s
    JOIN brands b
      ON b.id = s.brand_id
    WHERE s.brand_id = $1
      AND b.deleted_at IS NULL;
    `,
    [brandId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return mapScheduleRow(result.rows[0]);
}

export async function getBrandCalculationSchedule(
  pool: Pool,
  brandId: string,
): Promise<BrandCalculationScheduleRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  return selectSchedule(pool, brandId);
}

// One statement: lock the live brand's row, take unsent fields from it, update only if the resulting zone is one
// Postgres knows (so the worker's AT TIME ZONE can never fail at run time), and return the updated record.
// "found" tells 404 apart from a bad zone; the record columns are NULL when nothing was updated.
const UPDATE_SCHEDULE_SQL = `
WITH
current_schedule AS (
  SELECT s.*
  FROM brand_calculation_schedules s
  JOIN brands b
    ON b.id = s.brand_id
  WHERE s.brand_id = $1
    AND b.deleted_at IS NULL
  FOR UPDATE OF s
),
next_schedule AS (
  SELECT c.brand_id,
         COALESCE($2::boolean, c.is_enabled)        AS is_enabled,
         COALESCE($3::time, c.run_time)             AS run_time,
         COALESCE($4::text, c.time_zone)            AS time_zone,
         COALESCE($5::int, c.outlet_window_days)    AS outlet_window_days,
         COALESCE($6::int, c.customer_window_days)  AS customer_window_days,
         COALESCE($7::int, c.affinity_window_days)  AS affinity_window_days
  FROM current_schedule c
  WHERE EXISTS (
    SELECT 1 FROM pg_timezone_names z WHERE z.name = COALESCE($4::text, c.time_zone)
  )
),
updated AS (
  UPDATE brand_calculation_schedules s
  SET is_enabled = n.is_enabled,
      run_time = n.run_time,
      time_zone = n.time_zone,
      outlet_window_days = n.outlet_window_days,
      customer_window_days = n.customer_window_days,
      affinity_window_days = n.affinity_window_days,
      updated_by = $8,
      updated_at = now()
  FROM next_schedule n
  WHERE s.brand_id = n.brand_id
  RETURNING s.*
)
SELECT EXISTS (SELECT 1 FROM current_schedule) AS found, record.*
FROM (SELECT 1) AS one
LEFT JOIN (SELECT ${SCHEDULE_COLUMNS} FROM updated s) AS record
  ON TRUE;
`;

async function updateScheduleRow(
  client: PoolClient,
  brandId: string,
  data: UpdateBrandCalculationScheduleBodySchemaType,
  updatedBy: string,
): Promise<BrandCalculationScheduleRecordSchemaType> {
  const result = await client.query(UPDATE_SCHEDULE_SQL, [
    brandId,
    data.isEnabled ?? null,
    data.runTime ?? null,
    data.timeZone ?? null,
    data.outletWindowDays ?? null,
    data.customerWindowDays ?? null,
    data.affinityWindowDays ?? null,
    updatedBy,
  ]);

  const row = result.rows[0];
  if (!row.found) {
    throw new NotFoundError("Brand does not exist.");
  }
  if (row.brand_id === null) {
    throw new ValidationError("timeZone is not a known time zone.");
  }
  return mapScheduleRow(row);
}

// pg_timezone_names also lists names the scheduler cannot use (localtime, Factory, posixrules): BullMQ's cron
// parser resolves zones through Intl, so a zone Intl rejects would fail at sync time and look like an outage (503).
function assertSchedulerTimeZone(timeZone: string | undefined): void {
  if (timeZone === undefined) return;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new ValidationError("timeZone is not a known time zone.");
  }
}

// The scheduler is synced before COMMIT, so a Redis failure rolls the change back: the admin never sees a schedule
// that is not actually scheduled. A COMMIT failing after a successful sync is fixed by the worker's startup reconcile.
export async function updateBrandCalculationSchedule(
  pool: Pool,
  sync: SyncSchedule,
  brandId: string,
  data: UpdateBrandCalculationScheduleBodySchemaType,
  updatedBy: string,
): Promise<BrandCalculationScheduleRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(UpdateBrandCalculationScheduleBodySchema, data);
  assertSchedulerTimeZone(data.timeZone);

  return withTransaction(pool, async (client) => {
    const schedule = await updateScheduleRow(client, brandId, data, updatedBy);

    try {
      await sync(brandId, toTiming(schedule));
    } catch {
      throw new ServiceUnavailableError("Schedule cannot be saved right now. Please try again.");
    }

    return schedule;
  });
}

// For brand create, where a Redis outage must not fail the brand itself. Returns false on failure; the worker's
// startup reconcile catches up later.
export async function syncBrandCalculationScheduleBestEffort(
  pool: Pool,
  sync: SyncSchedule,
  brandId: string,
): Promise<boolean> {
  try {
    const schedule = await selectSchedule(pool, brandId);
    await sync(brandId, toTiming(schedule));
    return true;
  } catch {
    return false;
  }
}
