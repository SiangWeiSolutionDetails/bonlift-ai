import {
  BrandParamsSchema,
  BrandUsageQuerySchema,
  BrandUsageQuerySchemaType,
  BrandUsageSchemaType,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { NotFoundError, ValidationError } from "../errors.js";
import { assertValid } from "../utils/validate.js";

export interface ServingUsageEvent {
  brandId: string;
  apiKeyId: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

const CALL_COUNTS = `
  count(*) FILTER (WHERE status_code < 400) AS succeeded,
  count(*) FILTER (WHERE status_code BETWEEN 400 AND 499) AS client_errors,
  count(*) FILTER (WHERE status_code >= 500) AS server_errors`;

// $2 and $3 are inclusive dates in time zone $4, so the window is [from 00:00, to + 1 day 00:00) there.
// Only days with calls or runs are returned. No brand → bounds is empty → no row, which tells "unknown brand" apart from "no usage" in one round trip.
const BRAND_USAGE_SQL = `
  WITH bounds AS (
    SELECT b.id AS brand_id,
           $2::date::timestamp AT TIME ZONE $4 AS from_at,
           ($3::date + 1)::timestamp AT TIME ZONE $4 AS to_at
    FROM brands b
    WHERE b.id = $1
  ),
  calls AS (
    SELECT (e.created_at AT TIME ZONE $4)::date AS day, e.api_key_id, e.status_code
    FROM bounds
    JOIN serving_usage_events e
      ON e.brand_id = bounds.brand_id
     AND e.created_at >= bounds.from_at
     AND e.created_at < bounds.to_at
  ),
  runs AS (
    SELECT (r.started_at AT TIME ZONE $4)::date AS day, r.job_type, r.status
    FROM bounds
    JOIN computation_runs r
      ON r.brand_id = bounds.brand_id
     AND r.started_at >= bounds.from_at
     AND r.started_at < bounds.to_at
  ),
  call_days AS (
    SELECT day, ${CALL_COUNTS}
    FROM calls
    GROUP BY day
  ),
  run_days AS (
    SELECT day, count(*) AS runs
    FROM runs
    GROUP BY day
  ),
  days AS (
    SELECT coalesce(c.day, r.day) AS day,
           coalesce(c.succeeded, 0) AS succeeded,
           coalesce(c.client_errors, 0) AS client_errors,
           coalesce(c.server_errors, 0) AS server_errors,
           coalesce(r.runs, 0) AS calculation_runs
    FROM call_days c
    FULL JOIN run_days r ON r.day = c.day
  ),
  key_counts AS (
    SELECT c.api_key_id, k.name, k.key_prefix, count(*) AS total, ${CALL_COUNTS}
    FROM calls c
    LEFT JOIN brand_api_keys k ON k.id = c.api_key_id
    GROUP BY c.api_key_id, k.name, k.key_prefix
  ),
  run_counts AS (
    SELECT job_type, status, count(*) AS runs
    FROM runs
    GROUP BY job_type, status
  )
  SELECT
    (SELECT coalesce(json_agg(json_build_object(
              'date', day,
              'succeeded', succeeded,
              'clientErrors', client_errors,
              'serverErrors', server_errors,
              'calculationRuns', calculation_runs
            ) ORDER BY day), '[]'::json)
     FROM days) AS days,
    (SELECT coalesce(json_agg(json_build_object(
              'apiKeyId', api_key_id,
              'name', name,
              'keyPrefix', key_prefix,
              'succeeded', succeeded,
              'clientErrors', client_errors,
              'serverErrors', server_errors
            ) ORDER BY total DESC, name), '[]'::json)
     FROM key_counts) AS api_keys,
    (SELECT coalesce(json_agg(json_build_object(
              'jobType', job_type,
              'status', status,
              'runs', runs
            ) ORDER BY job_type, status), '[]'::json)
     FROM run_counts) AS calculations
  FROM bounds
`;

// Postgres and Node both use the IANA database, so a zone Node rejects is rejected here as a 400
// instead of reaching the query as a 500.
function assertValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    throw new ValidationError(`${tz} is not a valid time zone.`);
  }
}

export async function recordServingUsage(
  pool: Pool,
  event: ServingUsageEvent,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO serving_usage_events (brand_id, api_key_id, route, status_code, duration_ms)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      event.brandId,
      event.apiKeyId,
      event.route,
      event.statusCode,
      event.durationMs,
    ],
  );
}

export async function getBrandUsage(
  pool: Pool,
  brandId: string,
  query: BrandUsageQuerySchemaType,
): Promise<BrandUsageSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(BrandUsageQuerySchema, query);
  assertValidTimeZone(query.tz);
  if (query.from > query.to) {
    throw new ValidationError("from must not be after to.");
  }

  const result = await pool.query(BRAND_USAGE_SQL, [
    brandId,
    query.from,
    query.to,
    query.tz,
  ]);

  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("Brand does not exist.");
  }
  return {
    brandId,
    from: query.from,
    to: query.to,
    tz: query.tz,
    days: row.days,
    apiKeys: row.api_keys,
    calculations: row.calculations,
  };
}
