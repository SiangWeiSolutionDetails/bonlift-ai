import {
  BrandParamsSchema,
  CustomerItemScoresCustomerListQuerySchema,
  CustomerItemScoresCustomerListQuerySchemaType,
  CustomerItemScoresCustomerListSchemaType,
  CustomerItemScoresCustomerParamsSchema,
  CustomerItemScoresCustomerResultSchemaType,
  CustomerItemScoresCustomerSearchBodySchema,
  CustomerItemScoresCustomerSearchBodySchemaType,
  CustomerItemScoresRunListQuerySchema,
  CustomerItemScoresRunListQuerySchemaType,
  CustomerItemScoresRunRecordSchemaType,
  PublishCustomerItemScoresRunBodySchema,
  PublishCustomerItemScoresRunBodySchemaType,
  RunParamsSchema,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { toHashedCustomerId } from "../utils/customerIdHash.js";
import { assertValid } from "../utils/validate.js";

const DEFAULT_RUN_LIMIT = 50;
const DEFAULT_CUSTOMER_LIMIT = 50;

const RUN_COLUMNS = `
  r.id,
  r.brand_id,
  r.status,
  r.run_date::text          AS run_date,
  r.input_window_from::text AS window_from,
  r.input_window_to::text   AS window_to,
  v.version                 AS config_version,
  c.half_life_days,
  c.top_n,
  c.max_recent_orders,
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
  JOIN customer_item_scores_calculation_config_versions c
    ON c.id = r.calculation_config_version_id
  LEFT JOIN brand_published_runs p
    ON p.brand_id = r.brand_id
   AND p.job_type = r.job_type
   AND p.run_id = r.id`;

function mapRunRow(row: any): CustomerItemScoresRunRecordSchemaType {
  return {
    id: row.id,
    brandId: row.brand_id,
    status: row.status,
    runDate: row.run_date,
    from: row.window_from,
    to: row.window_to,
    configVersion: row.config_version,
    halfLifeDays: row.half_life_days,
    topN: row.top_n,
    maxRecentOrders: row.max_recent_orders,
    algorithmVersion: row.algorithm_version,
    triggerType: row.trigger_type,
    rowCount: row.row_count,
    error: row.error,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    isPublished: row.is_published,
  };
}

export async function getCustomerItemScoresRuns(
  pool: Pool,
  brandId: string,
  query: CustomerItemScoresRunListQuerySchemaType,
): Promise<CustomerItemScoresRunRecordSchemaType[]> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(CustomerItemScoresRunListQuerySchema, query);

  // The brand CTE tells "unknown brand" (no row) apart from "no runs yet" (one row with a NULL run).
  const result = await pool.query(
    `
    WITH brand AS (
      SELECT id FROM brands WHERE id = $1 AND deleted_at IS NULL
    )
    SELECT run.*
    FROM brand b
    LEFT JOIN LATERAL (
      SELECT ${RUN_COLUMNS}
      FROM computation_runs r
      ${RUN_JOINS}
      WHERE r.brand_id = b.id
        AND r.job_type = 'customer_item_scores'
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
export async function publishCustomerItemScoresRun(
  pool: Pool,
  brandId: string,
  body: PublishCustomerItemScoresRunBodySchemaType,
): Promise<CustomerItemScoresRunRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(PublishCustomerItemScoresRunBodySchema, body);

  const result = await pool.query(
    `
    WITH target AS (
      SELECT id, brand_id, job_type, status, row_count
      FROM computation_runs
      WHERE id = $2
        AND brand_id = $1
        AND job_type = 'customer_item_scores'
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = $1 AND b.deleted_at IS NULL)
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

const RUN_CTE = `
    WITH run AS (
      SELECT r.id
      FROM computation_runs r
      WHERE r.id = $1
        AND r.job_type = 'customer_item_scores'
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = r.brand_id AND b.deleted_at IS NULL)
    )`;

export async function getCustomerItemScoresCustomers(
  pool: Pool,
  runId: string,
  query: CustomerItemScoresCustomerListQuerySchemaType,
): Promise<CustomerItemScoresCustomerListSchemaType> {
  assertValid(RunParamsSchema, { runId });
  assertValid(CustomerItemScoresCustomerListQuerySchema, query);

  const limit = query.limit ?? DEFAULT_CUSTOMER_LIMIT;

  // Keyset paging over the primary key's prefix. One extra row tells whether another page exists.
  const result = await pool.query(
    `
    ${RUN_CTE}
    SELECT c.customer_id, c.item_count
    FROM run
    LEFT JOIN LATERAL (
      SELECT s.customer_external_id AS customer_id, count(DISTINCT s.external_item_id)::int AS item_count
      FROM customer_item_scores s
      WHERE s.run_id = run.id
        AND ($2::text IS NULL OR s.customer_external_id > $2)
      GROUP BY s.customer_external_id
      ORDER BY s.customer_external_id
      LIMIT $3
    ) c ON TRUE;
    `,
    [runId, query.after ?? null, limit + 1],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Run does not exist.");
  }

  const rows = result.rows.filter((row) => row.customer_id !== null);
  const page = rows.slice(0, limit);

  return {
    customers: page.map((row) => ({
      customerId: row.customer_id,
      itemCount: row.item_count,
    })),
    nextAfter: rows.length > limit ? page[page.length - 1].customer_id : null,
  };
}

// Ids are stored hashed, so a search is an exact lookup of the full mobile number or email, hashed the same way.
// Text that is not a valid id cannot match any customer: it becomes "", which no stored id equals, so the result is
// empty rather than an error. The run is still checked, so an unknown run is a 404 either way.
export async function searchCustomerItemScoresCustomer(
  pool: Pool,
  runId: string,
  body: CustomerItemScoresCustomerSearchBodySchemaType,
  customerIdSecret: string,
): Promise<CustomerItemScoresCustomerListSchemaType> {
  assertValid(RunParamsSchema, { runId });
  assertValid(CustomerItemScoresCustomerSearchBodySchema, body);

  const customer = toHashedCustomerId(customerIdSecret, body.customerId);
  const searchId = customer.status === "hashed" ? customer.id : "";

  const result = await pool.query(
    `
    ${RUN_CTE}
    SELECT c.customer_id, c.item_count
    FROM run
    LEFT JOIN LATERAL (
      SELECT s.customer_external_id AS customer_id, count(DISTINCT s.external_item_id)::int AS item_count
      FROM customer_item_scores s
      WHERE s.run_id = run.id
        AND s.customer_external_id = $2
      GROUP BY s.customer_external_id
    ) c ON TRUE;
    `,
    [runId, searchId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Run does not exist.");
  }

  return {
    customers: result.rows
      .filter((row) => row.customer_id !== null)
      .map((row) => ({ customerId: row.customer_id, itemCount: row.item_count })),
    nextAfter: null,
  };
}

export async function getCustomerItemScoresCustomerResult(
  pool: Pool,
  runId: string,
  customerId: string,
): Promise<CustomerItemScoresCustomerResultSchemaType> {
  assertValid(CustomerItemScoresCustomerParamsSchema, { runId, customerId });

  // Scores store only the item id; names come from the customer's own orders in the run's window, latest date
  // first. Every ranked item is in those orders, so other customers' lines are never expanded.
  // Dayparts are listed in the order of the outlet item scores config the worker used (latest at run creation);
  // all_day, and any name that config no longer lists, come last.
  const result = await pool.query(
    `
    WITH run AS (
      SELECT r.id, r.brand_id, r.created_at, r.input_window_from, r.input_window_to
      FROM computation_runs r
      WHERE r.id = $1
        AND r.job_type = 'customer_item_scores'
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = r.brand_id AND b.deleted_at IS NULL)
    ),
    daypart_config AS (
      SELECT c.dayparts
      FROM run
      JOIN calculation_config_versions v
        ON v.brand_id = run.brand_id
       AND v.job_type = 'outlet_item_scores'
       AND v.created_at <= run.created_at
      JOIN outlet_item_scores_calculation_config_versions c
        ON c.id = v.id
      ORDER BY v.version DESC
      LIMIT 1
    ),
    daypart_order AS (
      SELECT d.value->>'name' AS name, d.position
      FROM daypart_config
      CROSS JOIN LATERAL jsonb_array_elements(daypart_config.dayparts) WITH ORDINALITY AS d(value, position)
    ),
    scores AS (
      SELECT s.daypart, s.rank, s.external_item_id, s.score, s.n_orders
      FROM customer_item_scores s
      JOIN run ON s.run_id = run.id
      WHERE s.customer_external_id = $2
    ),
    names AS (
      SELECT DISTINCT ON (i->>'itemId')
             i->>'itemId'               AS item_id,
             NULLIF(i->>'itemName', '') AS item_name
      FROM run
      JOIN outlets ot
        ON ot.brand_id = run.brand_id
      JOIN order_snapshots os
        ON os.outlet_id = ot.id
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
      WHERE btrim(o->>'customerId', E' \\t\\r\\n') = $2
        AND i->>'itemId' IN (SELECT external_item_id FROM scores)
      ORDER BY i->>'itemId', os.order_date DESC
    )
    SELECT COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'daypart',  s.daypart,
                        'rank',     s.rank,
                        'itemId',   s.external_item_id,
                        'itemName', n.item_name,
                        'score',    s.score::float8,
                        'nOrders',  s.n_orders
                      )
                      ORDER BY dpo.position NULLS LAST, s.daypart, s.rank
                    )
             FROM scores s
             LEFT JOIN names n ON n.item_id = s.external_item_id
             LEFT JOIN daypart_order dpo ON dpo.name = s.daypart
           ), '[]'::jsonb) AS items
    FROM run;
    `,
    [runId, customerId],
  );

  if (result.rows.length === 0 || result.rows[0].items.length === 0) {
    throw new NotFoundError("Customer has no scores in this run.");
  }

  return { customerId, items: result.rows[0].items };
}
