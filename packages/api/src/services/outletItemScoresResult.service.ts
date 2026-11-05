import {
  OutletItemScoresRunListQuerySchema,
  OutletItemScoresRunListQuerySchemaType,
  OutletItemScoresRunRecordSchemaType,
  OutletItemScoresRunResultSchemaType,
  OutletParamsSchema,
  PublishOutletItemScoresRunBodySchema,
  PublishOutletItemScoresRunBodySchemaType,
  RunParamsSchema,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { assertValid } from "../utils/validate.js";

const DEFAULT_RUN_LIMIT = 50;

const RUN_COLUMNS = `
  r.id,
  r.outlet_id,
  r.status,
  r.run_date::text          AS run_date,
  r.input_window_from::text AS window_from,
  r.input_window_to::text   AS window_to,
  v.version                 AS config_version,
  c.half_life_days,
  c.top_n,
  c.dayparts,
  r.algorithm_version,
  r.trigger_type,
  r.row_count,
  r.error,
  r.started_at,
  r.finished_at,
  p.run_id IS NOT NULL      AS is_published`;

const RUN_FROM = `
  FROM computation_runs r
  JOIN calculation_config_versions v
    ON v.id = r.calculation_config_version_id
  JOIN outlet_item_scores_calculation_config_versions c
    ON c.id = r.calculation_config_version_id
  LEFT JOIN published_runs p
    ON p.outlet_id = r.outlet_id
   AND p.job_type = r.job_type
   AND p.run_id = r.id`;

function mapRunRow(row: any): OutletItemScoresRunRecordSchemaType {
  return {
    id: row.id,
    outletId: row.outlet_id,
    status: row.status,
    runDate: row.run_date,
    from: row.window_from,
    to: row.window_to,
    configVersion: row.config_version,
    halfLifeDays: row.half_life_days,
    topN: row.top_n,
    dayparts: row.dayparts,
    algorithmVersion: row.algorithm_version,
    triggerType: row.trigger_type,
    rowCount: row.row_count,
    error: row.error,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    isPublished: row.is_published,
  };
}

export async function getOutletItemScoresRuns(
  pool: Pool,
  outletId: string,
  query: OutletItemScoresRunListQuerySchemaType,
): Promise<OutletItemScoresRunRecordSchemaType[]> {
  assertValid(OutletParamsSchema, { outletId });
  assertValid(OutletItemScoresRunListQuerySchema, query);

  // The outlet CTE tells "unknown outlet" (no row) apart from "no runs yet" (one row with a NULL run).
  const result = await pool.query(
    `
    WITH outlet AS (
      SELECT id FROM outlets WHERE id = $1 AND deleted_at IS NULL
    )
    SELECT run.*
    FROM outlet o
    LEFT JOIN LATERAL (
      SELECT ${RUN_COLUMNS}
      ${RUN_FROM}
      WHERE r.outlet_id = o.id
        AND r.job_type = 'outlet_item_scores'
      ORDER BY r.started_at DESC
      LIMIT $2
    ) run ON TRUE;
    `,
    [outletId, query.limit ?? DEFAULT_RUN_LIMIT],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Outlet does not exist.");
  }

  return result.rows.filter((row) => row.id !== null).map(mapRunRow);
}

// Manual publish skips the worker's "later window wins" rule on purpose: repointing to an older run is the rollback.
export async function publishOutletItemScoresRun(
  pool: Pool,
  outletId: string,
  body: PublishOutletItemScoresRunBodySchemaType,
): Promise<OutletItemScoresRunRecordSchemaType> {
  assertValid(OutletParamsSchema, { outletId });
  assertValid(PublishOutletItemScoresRunBodySchema, body);

  const result = await pool.query(
    `
    WITH target AS (
      SELECT id, outlet_id, job_type, status, row_count
      FROM computation_runs
      WHERE id = $2
        AND outlet_id = $1
        AND job_type = 'outlet_item_scores'
        AND EXISTS (SELECT 1 FROM outlets o WHERE o.id = $1 AND o.deleted_at IS NULL)
    ),
    published AS (
      INSERT INTO published_runs (outlet_id, job_type, run_id)
      SELECT outlet_id, job_type, id
      FROM target
      WHERE status = 'succeeded'
        AND row_count > 0
      ON CONFLICT (outlet_id, job_type) DO UPDATE
      SET run_id = EXCLUDED.run_id,
          updated_at = now()
      RETURNING run_id
    )
    SELECT ${RUN_COLUMNS},
           (SELECT run_id FROM published) IS NOT NULL AS was_published
    FROM target t
    JOIN computation_runs r
      ON r.id = t.id
    JOIN calculation_config_versions v
      ON v.id = r.calculation_config_version_id
    JOIN outlet_item_scores_calculation_config_versions c
      ON c.id = r.calculation_config_version_id
    LEFT JOIN published_runs p
      ON p.outlet_id = r.outlet_id
     AND p.job_type = r.job_type
     AND p.run_id = r.id;
    `,
    [outletId, body.runId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Run does not exist for this outlet.");
  }

  const row = result.rows[0];
  if (!row.was_published) {
    throw new ConflictError(
      row.status === "succeeded"
        ? "Run has no results to publish."
        : "Only a succeeded run can be published.",
    );
  }

  // The CTE's write is not visible to this statement's own read of published_runs, so set the flag from the write.
  return mapRunRow({ ...row, is_published: true });
}

export async function getOutletItemScoresRunResult(
  pool: Pool,
  runId: string,
): Promise<OutletItemScoresRunResultSchemaType> {
  assertValid(RunParamsSchema, { runId });

  // Scores store only the item id; names come from the run's own snapshot window, latest date first,
  // scanning only for the ids that were ranked.
  const result = await pool.query(
    `
    WITH run AS (
      SELECT ${RUN_COLUMNS},
             r.input_window_from,
             r.input_window_to
      ${RUN_FROM}
      WHERE r.id = $1
        AND r.job_type = 'outlet_item_scores'
        AND EXISTS (SELECT 1 FROM outlets o WHERE o.id = r.outlet_id AND o.deleted_at IS NULL)
    ),
    scores AS (
      SELECT s.daypart, s.rank, s.external_item_id, s.score, s.n_orders
      FROM outlet_item_scores s
      JOIN run ON s.run_id = run.id
    ),
    names AS (
      SELECT DISTINCT ON (i->>'itemId')
             i->>'itemId'                AS item_id,
             NULLIF(i->>'itemName', '') AS item_name
      FROM run
      JOIN order_snapshots os
        ON os.outlet_id = run.outlet_id
       AND os.order_date >= run.input_window_from
       AND os.order_date <= run.input_window_to
      CROSS JOIN LATERAL jsonb_array_elements(os.orders) AS o
      CROSS JOIN LATERAL jsonb_array_elements(o->'lines') AS l
      CROSS JOIN LATERAL (
        SELECT l
        UNION ALL
        SELECT a FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(l->'addons') = 'array' THEN l->'addons' END
        ) AS a
      ) AS x(i)
      WHERE i->>'itemId' IN (SELECT external_item_id FROM scores)
      ORDER BY i->>'itemId', os.order_date DESC
    )
    SELECT run.*,
           COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'daypart',  s.daypart,
                        'rank',     s.rank,
                        'itemId',   s.external_item_id,
                        'itemName', n.item_name,
                        'score',    s.score::float8,
                        'nOrders',  s.n_orders
                      )
                      ORDER BY s.daypart, s.rank
                    )
             FROM scores s
             LEFT JOIN names n ON n.item_id = s.external_item_id
           ), '[]'::jsonb) AS items
    FROM run;
    `,
    [runId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Run does not exist.");
  }

  return { run: mapRunRow(result.rows[0]), items: result.rows[0].items };
}
