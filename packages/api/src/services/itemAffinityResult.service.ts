import {
  BrandParamsSchema,
  ItemAffinityItemListSchemaType,
  ItemAffinityItemParamsSchema,
  ItemAffinityItemResultSchemaType,
  ItemAffinityRunListQuerySchema,
  ItemAffinityRunListQuerySchemaType,
  ItemAffinityRunRecordSchemaType,
  PublishItemAffinityRunBodySchema,
  PublishItemAffinityRunBodySchemaType,
  RunParamsSchema,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { assertValid } from "../utils/validate.js";

const DEFAULT_RUN_LIMIT = 50;

const RUN_COLUMNS = `
  r.id,
  r.brand_id,
  r.status,
  r.run_date::text          AS run_date,
  r.input_window_from::text AS window_from,
  r.input_window_to::text   AS window_to,
  v.version                 AS config_version,
  c.top_n,
  c.min_pair_orders,
  c.max_order_items,
  r.algorithm_version,
  r.trigger_type,
  r.row_count,
  r.error,
  r.started_at,
  r.finished_at,
  p.run_id IS NOT NULL      AS is_published`;

const RUN_JOINS = `
  JOIN calculation_config_versions v
    ON v.id = r.calculation_config_version_id
  JOIN item_affinity_calculation_config_versions c
    ON c.id = r.calculation_config_version_id
  LEFT JOIN brand_published_runs p
    ON p.brand_id = r.brand_id
   AND p.job_type = r.job_type
   AND p.run_id = r.id`;

function mapRunRow(row: any): ItemAffinityRunRecordSchemaType {
  return {
    id: row.id,
    brandId: row.brand_id,
    status: row.status,
    runDate: row.run_date,
    from: row.window_from,
    to: row.window_to,
    configVersion: row.config_version,
    topN: row.top_n,
    minPairOrders: row.min_pair_orders,
    maxOrderItems: row.max_order_items,
    algorithmVersion: row.algorithm_version,
    triggerType: row.trigger_type,
    rowCount: row.row_count,
    error: row.error,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    isPublished: row.is_published,
  };
}

export async function getItemAffinityRuns(
  pool: Pool,
  brandId: string,
  query: ItemAffinityRunListQuerySchemaType,
): Promise<ItemAffinityRunRecordSchemaType[]> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(ItemAffinityRunListQuerySchema, query);

  // The brand CTE tells "unknown brand" (no row) apart from "no runs yet" (one row with a NULL run).
  const result = await pool.query(
    `
    WITH brand AS (
      SELECT id FROM brands WHERE id = $1
    )
    SELECT run.*
    FROM brand b
    LEFT JOIN LATERAL (
      SELECT ${RUN_COLUMNS}
      FROM computation_runs r
      ${RUN_JOINS}
      WHERE r.brand_id = b.id
        AND r.job_type = 'item_affinity'
        AND r.outlet_id IS NULL
      ORDER BY r.started_at DESC
      LIMIT $2
    ) run ON TRUE;
    `,
    [brandId, query.limit ?? DEFAULT_RUN_LIMIT],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return result.rows.filter((row) => row.id !== null).map(mapRunRow);
}

// Manual publish skips the worker's "later window wins" rule on purpose: repointing to an older run is the rollback.
export async function publishItemAffinityRun(
  pool: Pool,
  brandId: string,
  body: PublishItemAffinityRunBodySchemaType,
): Promise<ItemAffinityRunRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(PublishItemAffinityRunBodySchema, body);

  const result = await pool.query(
    `
    WITH target AS (
      SELECT id, brand_id, job_type, status, row_count
      FROM computation_runs
      WHERE id = $2
        AND brand_id = $1
        AND job_type = 'item_affinity'
    ),
    published AS (
      INSERT INTO brand_published_runs (brand_id, job_type, run_id)
      SELECT brand_id, job_type, id
      FROM target
      WHERE status = 'succeeded'
        AND row_count > 0
      ON CONFLICT (brand_id, job_type) DO UPDATE
      SET run_id = EXCLUDED.run_id,
          updated_at = now()
      RETURNING run_id
    )
    SELECT ${RUN_COLUMNS},
           (SELECT run_id FROM published) IS NOT NULL AS was_published
    FROM target t
    JOIN computation_runs r
      ON r.id = t.id
    ${RUN_JOINS};
    `,
    [brandId, body.runId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Run does not exist for this brand.");
  }

  const row = result.rows[0];
  if (!row.was_published) {
    throw new ConflictError(
      row.status === "succeeded"
        ? "Run has no results to publish."
        : "Only a succeeded run can be published.",
    );
  }

  // The CTE's write is not visible to this statement's own read of brand_published_runs, so set the flag from the write.
  return mapRunRow({ ...row, is_published: true });
}

// No paging: the list is bounded by the size of the menu, and the admin page filters it locally.
export async function getItemAffinityItems(
  pool: Pool,
  runId: string,
): Promise<ItemAffinityItemListSchemaType> {
  assertValid(RunParamsSchema, { runId });

  const result = await pool.query(
    `
    WITH run AS (
      SELECT id
      FROM computation_runs
      WHERE id = $1
        AND job_type = 'item_affinity'
    )
    SELECT i.item_id, i.item_name, i.n_orders, i.pair_count
    FROM run
    LEFT JOIN LATERAL (
      SELECT s.item_a AS item_id,
             max(s.item_a_name) AS item_name,
             max(s.n_item_a) AS n_orders,
             count(*)::int AS pair_count
      FROM item_affinity_scores s
      WHERE s.run_id = run.id
      GROUP BY s.item_a
    ) i ON TRUE
    ORDER BY i.n_orders DESC, i.item_id;
    `,
    [runId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Run does not exist.");
  }

  return {
    items: result.rows
      .filter((row) => row.item_id !== null)
      .map((row) => ({
        itemId: row.item_id,
        itemName: row.item_name,
        nOrders: row.n_orders,
        pairCount: row.pair_count,
      })),
  };
}

export async function getItemAffinityItemResult(
  pool: Pool,
  runId: string,
  itemId: string,
): Promise<ItemAffinityItemResultSchemaType> {
  assertValid(ItemAffinityItemParamsSchema, { runId, itemId });

  const result = await pool.query(
    `
    WITH run AS (
      SELECT id
      FROM computation_runs
      WHERE id = $1
        AND job_type = 'item_affinity'
    ),
    scores AS (
      SELECT s.*
      FROM item_affinity_scores s
      JOIN run ON s.run_id = run.id
      WHERE s.item_a = $2
    )
    SELECT (SELECT max(item_a_name) FROM scores) AS item_name,
           (SELECT max(n_item_a) FROM scores) AS n_orders,
           COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'rank',       s.rank,
                        'itemId',     s.item_b,
                        'itemName',   s.item_b_name,
                        'nPair',      s.n_pair,
                        'confidence', s.confidence::float8,
                        'lift',       s.lift::float8
                      )
                      ORDER BY s.rank
                    )
             FROM scores s
           ), '[]'::jsonb) AS partners
    FROM run;
    `,
    [runId, itemId],
  );

  if (result.rows.length === 0 || result.rows[0].partners.length === 0) {
    throw new NotFoundError("Item has no partners in this run.");
  }

  const row = result.rows[0];
  return {
    itemId,
    itemName: row.item_name,
    nOrders: row.n_orders,
    partners: row.partners,
  };
}
