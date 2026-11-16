import {
  BrandParamsSchema,
  CalculationOverviewEntrySchemaType,
  CalculationOverviewOutletSchemaType,
  CalculationOverviewRunSchemaType,
  CalculationsOverviewSchemaType,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";
import { NotFoundError } from "../errors.js";
import { assertValid } from "../utils/validate.js";

const RUN_JSON = `
  json_build_object(
    'id',          r.id,
    'status',      r.status,
    'triggerType', r.trigger_type,
    'from',        r.input_window_from::text,
    'to',          r.input_window_to::text,
    'rowCount',    r.row_count,
    'error',       r.error,
    'startedAt',   r.started_at,
    'finishedAt',  r.finished_at
  )`;

// Every lookup is by outlet or brand plus job type, so each one rides an existing index: the started_at indexes for
// latest and failed runs, the one-running indexes for running runs, the published tables' primary keys, and the
// score tables' primary keys (run_id first) for metrics and top lists.
// Top items use the all_day list only: it already counts every order of the day, so adding the daypart lists would
// count the same orders again. Their names come from the published affinity run when the item is in it, else from
// the newest snapshot of the outlet that orders it most, as the outlet results page reads them.
const OVERVIEW_SQL = `
WITH
brand AS (
  SELECT b.id, s.time_zone, s.outlet_window_days, s.customer_window_days, s.affinity_window_days,
         (now() AT TIME ZONE s.time_zone)::date - 1 AS window_to
  FROM brands b
  JOIN brand_calculation_schedules s
    ON s.brand_id = b.id
  WHERE b.id = $1
    AND b.deleted_at IS NULL
),
outlet_state AS (
  SELECT o.id, o.name, o.is_active,
         EXISTS (
           SELECT 1
           FROM order_snapshots os
           WHERE os.outlet_id = o.id
             AND os.order_date BETWEEN b.window_to - (b.outlet_window_days - 1) AND b.window_to
         ) AS has_orders_in_window,
         latest.run AS latest_run,
         pub.id AS published_run_id,
         pub.input_window_from AS published_from,
         pub.input_window_to AS published_to,
         pub.run AS published_run,
         (
           SELECT count(*)
           FROM computation_runs r
           WHERE r.outlet_id = o.id
             AND r.job_type = 'outlet_item_scores'
             AND r.status = 'running'
         ) AS running_runs,
         recent.failed_runs,
         recent.succeeded_runs
  FROM brand b
  JOIN outlets o
    ON o.brand_id = b.id
   AND o.deleted_at IS NULL
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE r.status = 'failed') AS failed_runs,
           count(*) FILTER (WHERE r.status = 'succeeded') AS succeeded_runs
    FROM computation_runs r
    WHERE r.outlet_id = o.id
      AND r.job_type = 'outlet_item_scores'
      AND r.started_at > now() - interval '7 days'
  ) recent
  LEFT JOIN LATERAL (
    SELECT ${RUN_JSON} AS run
    FROM computation_runs r
    WHERE r.outlet_id = o.id
      AND r.job_type = 'outlet_item_scores'
    ORDER BY r.started_at DESC
    LIMIT 1
  ) latest ON TRUE
  LEFT JOIN LATERAL (
    SELECT r.id, r.input_window_from, r.input_window_to, ${RUN_JSON} AS run
    FROM published_runs p
    JOIN computation_runs r
      ON r.id = p.run_id
    WHERE p.outlet_id = o.id
      AND p.job_type = 'outlet_item_scores'
  ) pub ON TRUE
),
brand_state AS (
  SELECT j.sort_order, j.job_type, j.window_days,
         latest.run AS latest_run,
         pub.id AS published_run_id,
         pub.input_window_to AS published_to,
         pub.run AS published_run,
         (
           SELECT count(*)
           FROM computation_runs r
           WHERE r.brand_id = b.id
             AND r.job_type = j.job_type
             AND r.outlet_id IS NULL
             AND r.status = 'running'
         ) AS running_runs,
         recent.failed_runs,
         recent.succeeded_runs
  FROM brand b
  CROSS JOIN LATERAL (
    VALUES (1, 'customer_item_scores', b.customer_window_days),
           (2, 'item_affinity', b.affinity_window_days)
  ) AS j(sort_order, job_type, window_days)
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE r.status = 'failed') AS failed_runs,
           count(*) FILTER (WHERE r.status = 'succeeded') AS succeeded_runs
    FROM computation_runs r
    WHERE r.brand_id = b.id
      AND r.job_type = j.job_type
      AND r.outlet_id IS NULL
      AND r.started_at > now() - interval '7 days'
  ) recent
  LEFT JOIN LATERAL (
    SELECT ${RUN_JSON} AS run
    FROM computation_runs r
    WHERE r.brand_id = b.id
      AND r.job_type = j.job_type
      AND r.outlet_id IS NULL
    ORDER BY r.started_at DESC
    LIMIT 1
  ) latest ON TRUE
  LEFT JOIN LATERAL (
    SELECT r.id, r.input_window_to, ${RUN_JSON} AS run
    FROM brand_published_runs p
    JOIN computation_runs r
      ON r.id = p.run_id
    WHERE p.brand_id = b.id
      AND p.job_type = j.job_type
  ) pub ON TRUE
),
outlet_metrics AS (
  SELECT count(DISTINCT s.external_item_id) AS subjects, count(*) AS row_total
  FROM outlet_state o
  JOIN outlet_item_scores s
    ON s.run_id = o.published_run_id
),
customer_metrics AS (
  SELECT count(DISTINCT s.customer_external_id) AS subjects, count(*) AS row_total
  FROM brand_state j
  JOIN customer_item_scores s
    ON s.run_id = j.published_run_id
  WHERE j.job_type = 'customer_item_scores'
),
affinity_metrics AS (
  SELECT count(DISTINCT s.item_a) AS subjects, count(*) AS row_total
  FROM brand_state j
  JOIN item_affinity_scores s
    ON s.run_id = j.published_run_id
  WHERE j.job_type = 'item_affinity'
),
top_pairs AS (
  SELECT s.item_a, s.item_a_name, s.item_b, s.item_b_name, s.confidence, s.lift, s.n_pair
  FROM brand_state j
  JOIN item_affinity_scores s
    ON s.run_id = j.published_run_id
  WHERE j.job_type = 'item_affinity'
  ORDER BY s.confidence DESC, s.lift DESC, s.item_a, s.item_b
  LIMIT 5
),
top_items AS (
  SELECT s.external_item_id AS item_id,
         sum(s.n_orders) AS n_orders,
         count(DISTINCT s.outlet_id) AS outlets,
         (array_agg(s.outlet_id ORDER BY s.n_orders DESC, s.outlet_id))[1] AS name_outlet_id
  FROM outlet_state o
  JOIN outlet_item_scores s
    ON s.run_id = o.published_run_id
  WHERE s.daypart = 'all_day'
  GROUP BY s.external_item_id
  ORDER BY n_orders DESC, s.external_item_id
  LIMIT 10
),
top_item_names AS (
  SELECT t.item_id, t.n_orders, t.outlets,
         COALESCE(
           (
             SELECT a.item_a_name
             FROM brand_state j
             JOIN item_affinity_scores a
               ON a.run_id = j.published_run_id
              AND a.item_a = t.item_id
             WHERE j.job_type = 'item_affinity'
               AND a.item_a_name IS NOT NULL
             LIMIT 1
           ),
           (
             SELECT NULLIF(i->>'itemName', '')
             FROM outlet_state o
             JOIN order_snapshots os
               ON os.outlet_id = o.id
              AND os.order_date BETWEEN o.published_from AND o.published_to
             CROSS JOIN LATERAL jsonb_array_elements(os.orders) AS ord
             CROSS JOIN LATERAL jsonb_array_elements(ord->'lines') AS i
             WHERE o.id = t.name_outlet_id
               AND i->>'itemId' = t.item_id
             ORDER BY os.order_date DESC
             LIMIT 1
           )
         ) AS item_name
  FROM top_items t
)
SELECT
  b.time_zone,
  b.window_to::text AS window_to,
  b.outlet_window_days,
  COALESCE((
    SELECT json_agg(
             json_build_object(
               'outletId',          o.id,
               'outletName',        o.name,
               'isActive',          o.is_active,
               'hasOrdersInWindow', o.has_orders_in_window,
               'latestRun',         o.latest_run,
               'publishedRun',      o.published_run
             )
             ORDER BY o.name, o.id
           )
    FROM outlet_state o
  ), '[]'::json) AS outlets,
  (SELECT COALESCE(sum(o.running_runs), 0) FROM outlet_state o) AS outlet_running_runs,
  (SELECT COALESCE(sum(o.failed_runs), 0) FROM outlet_state o) AS outlet_failed_runs,
  (SELECT COALESCE(sum(o.succeeded_runs), 0) FROM outlet_state o) AS outlet_succeeded_runs,
  -- Inactive outlets are never recalculated, so their old published window would age forever.
  b.window_to - (SELECT min(o.published_to) FROM outlet_state o WHERE o.is_active) AS outlet_results_age_days,
  (SELECT subjects FROM outlet_metrics) AS outlet_subjects,
  (SELECT row_total FROM outlet_metrics) AS outlet_rows,
  (SELECT subjects FROM customer_metrics) AS customer_subjects,
  (SELECT row_total FROM customer_metrics) AS customer_rows,
  (SELECT subjects FROM affinity_metrics) AS affinity_subjects,
  (SELECT row_total FROM affinity_metrics) AS affinity_rows,
  (
    SELECT json_agg(
             json_build_object(
               'jobType',        j.job_type,
               'windowDays',     j.window_days,
               'latestRun',      j.latest_run,
               'publishedRun',   j.published_run,
               'runningRuns',    j.running_runs,
               'failedRuns',     j.failed_runs,
               'succeededRuns',  j.succeeded_runs,
               'resultsAgeDays', b.window_to - j.published_to
             )
             ORDER BY j.sort_order
           )
    FROM brand_state j
  ) AS brand_calculations,
  COALESCE((
    SELECT json_agg(
             json_build_object(
               'itemA',      p.item_a,
               'itemAName',  p.item_a_name,
               'itemB',      p.item_b,
               'itemBName',  p.item_b_name,
               'confidence', p.confidence::float8,
               'lift',       p.lift::float8,
               'nPair',      p.n_pair
             )
             ORDER BY p.confidence DESC, p.lift DESC, p.item_a, p.item_b
           )
    FROM top_pairs p
  ), '[]'::json) AS top_pairs,
  COALESCE((
    SELECT json_agg(
             json_build_object(
               'itemId',   n.item_id,
               'itemName', n.item_name,
               'nOrders',  n.n_orders,
               'outlets',  n.outlets
             )
             ORDER BY n.n_orders DESC, n.item_id
           )
    FROM top_item_names n
  ), '[]'::json) AS top_items
FROM brand b;
`;

type Metrics = CalculationOverviewEntrySchemaType["metrics"];

function toIsoString(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

// json_build_object renders timestamps in the session's zone; the API returns them as toISOString does elsewhere.
function mapRun(run: any): CalculationOverviewRunSchemaType | null {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    triggerType: run.triggerType,
    from: run.from,
    to: run.to,
    rowCount: run.rowCount,
    error: run.error,
    startedAt: new Date(run.startedAt).toISOString(),
    finishedAt: toIsoString(run.finishedAt),
  };
}

function mapOutlet(outlet: any): CalculationOverviewOutletSchemaType {
  return {
    outletId: outlet.outletId,
    outletName: outlet.outletName,
    isActive: outlet.isActive,
    hasOrdersInWindow: outlet.hasOrdersInWindow,
    latestRun: mapRun(outlet.latestRun),
    publishedRun: mapRun(outlet.publishedRun),
  };
}

function toMetrics(subjects: string, rows: string): Metrics {
  return { subjects: Number(subjects), rows: Number(rows) };
}

function toNullableNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function buildOutletEntry(row: any): CalculationOverviewEntrySchemaType {
  return {
    jobType: "outlet_item_scores",
    scope: "outlet",
    windowDays: row.outlet_window_days,
    latestRun: null,
    publishedRun: null,
    outlets: row.outlets.map(mapOutlet),
    runningRuns: Number(row.outlet_running_runs),
    failedRunsLast7Days: Number(row.outlet_failed_runs),
    succeededRunsLast7Days: Number(row.outlet_succeeded_runs),
    resultsAgeDays: toNullableNumber(row.outlet_results_age_days),
    metrics: toMetrics(row.outlet_subjects, row.outlet_rows),
  };
}

function buildBrandEntry(calculation: any, metrics: Metrics): CalculationOverviewEntrySchemaType {
  return {
    jobType: calculation.jobType,
    scope: "brand",
    windowDays: calculation.windowDays,
    latestRun: mapRun(calculation.latestRun),
    publishedRun: mapRun(calculation.publishedRun),
    outlets: [],
    runningRuns: Number(calculation.runningRuns),
    failedRunsLast7Days: Number(calculation.failedRuns),
    succeededRunsLast7Days: Number(calculation.succeededRuns),
    resultsAgeDays: toNullableNumber(calculation.resultsAgeDays),
    metrics,
  };
}

function brandMetrics(row: any, jobType: string): Metrics {
  return jobType === "customer_item_scores"
    ? toMetrics(row.customer_subjects, row.customer_rows)
    : toMetrics(row.affinity_subjects, row.affinity_rows);
}

function mapOverview(brandId: string, row: any): CalculationsOverviewSchemaType {
  return {
    brandId,
    timeZone: row.time_zone,
    windowTo: row.window_to,
    calculations: [
      buildOutletEntry(row),
      ...row.brand_calculations.map((calculation: any) =>
        buildBrandEntry(calculation, brandMetrics(row, calculation.jobType)),
      ),
    ],
    topPairs: row.top_pairs,
    topItems: row.top_items.map((item: any) => ({ ...item, nOrders: Number(item.nOrders), outlets: Number(item.outlets) })),
  };
}

export async function getCalculationsOverview(
  pool: Pool,
  brandId: string,
): Promise<CalculationsOverviewSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(OVERVIEW_SQL, [brandId]);
  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return mapOverview(brandId, result.rows[0]);
}
