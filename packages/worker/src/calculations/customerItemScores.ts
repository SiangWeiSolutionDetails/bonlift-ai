import { Pool } from "pg";
import { Run } from "../runs/runs.repository.js";

// SET LOCAL only lasts until COMMIT/ROLLBACK. Same reasons as outletItemScores: jit overhead from the
// planner's jsonb_array_elements estimate, and a GROUP BY hash that spills at the default work_mem.
const BEGIN_SQL = `BEGIN; SET LOCAL jit = off; SET LOCAL work_mem = '64MB'`;

// $1 = run id. Config, brand and window all come from the run row, so the statement scores exactly what the run recorded.
const SCORE_AND_PUBLISH_SQL = `
WITH run AS (
  SELECT r.id, r.brand_id, r.job_type, r.run_date,
         r.input_window_from, r.input_window_to,
         c.half_life_days, c.top_n
  FROM computation_runs r
  JOIN customer_item_scores_calculation_config_versions c
    ON c.id = r.calculation_config_version_id
  WHERE r.id = $1
),
-- One row per identified order. outlet_id is in the key because an orderId is only unique per outlet and date.
-- Inactive outlets are included: that history is still the customer's; deleted outlets are not. Blank IDs are anonymous and surrounding
-- whitespace is dropped, so "C1 " is C1. If a repeated orderId disagrees, the ORDER BY tiebreak picks the same copy every run.
orders AS (
  SELECT DISTINCT ON (os.outlet_id, os.order_date, o->>'orderId')
         os.outlet_id,
         os.order_date,
         o->>'orderId'                          AS order_id,
         btrim(o->>'customerId', E' \\t\\r\\n') AS customer_id,
         o->'lines'                             AS lines
  FROM run
  JOIN outlets ot
    ON ot.brand_id = run.brand_id
   AND ot.deleted_at IS NULL
  JOIN order_snapshots os
    ON os.outlet_id = ot.id
   AND os.order_date >= run.input_window_from
   AND os.order_date <= run.input_window_to
  CROSS JOIN LATERAL jsonb_array_elements(os.orders) AS o
  WHERE btrim(o->>'customerId', E' \\t\\r\\n') <> ''
  ORDER BY os.outlet_id, os.order_date, o->>'orderId', customer_id, lines
),
-- One row per item: each line plus its addons; modifiers ignored (P3-D1)
items AS (
  SELECT o.outlet_id,
         o.order_date,
         o.order_id,
         o.customer_id,
         i->>'itemId'               AS item_id,
         (i->>'qty')::numeric       AS qty,
         (i->>'unitPrice')::numeric AS unit_price
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.lines) AS l
  CROSS JOIN LATERAL (
    SELECT l
    UNION ALL
    SELECT a FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(l->'addons') = 'array' THEN l->'addons' END
    ) AS a
  ) AS x(i)
),
-- One row per (order, item) with net qty > 0; negative prices dropped (P3-D7)
order_items AS (
  SELECT outlet_id, order_date, order_id, customer_id, item_id
  FROM items
  WHERE unit_price >= 0
  GROUP BY outlet_id, order_date, order_id, customer_id, item_id
  HAVING sum(qty) > 0
),
-- Weight depends only on the date, so power() runs once per day. MATERIALIZED stops the planner
-- from inlining it into the join and calling power() once per item row (P3-D2)
date_weights AS MATERIALIZED (
  SELECT g.day::date AS order_date,
         power(0.5, (run.input_window_to - g.day::date)::numeric / run.half_life_days) AS weight
  FROM run
  CROSS JOIN LATERAL generate_series(run.input_window_from, run.input_window_to, interval '1 day') AS g(day)
),
scored_items AS (
  SELECT oi.outlet_id, oi.order_date, oi.order_id, oi.customer_id, oi.item_id, w.weight
  FROM order_items oi
  JOIN date_weights w USING (order_date)
),
-- Denominator: weight of every non-empty order of the customer, each order once
customer_totals AS (
  SELECT customer_id, sum(weight) AS total_weight
  FROM (SELECT DISTINCT outlet_id, order_date, order_id, customer_id, weight FROM scored_items) o
  GROUP BY customer_id
),
item_scores AS (
  SELECT customer_id, item_id, sum(weight) AS weight, count(*) AS n_orders
  FROM scored_items
  GROUP BY customer_id, item_id
),
ranked AS (
  SELECT s.customer_id, s.item_id, s.weight / t.total_weight AS score, s.n_orders,
         row_number() OVER (
           PARTITION BY s.customer_id
           ORDER BY s.weight / t.total_weight DESC, s.n_orders DESC, s.item_id
         ) AS rank
  FROM item_scores s
  JOIN customer_totals t USING (customer_id)
),
inserted AS (
  INSERT INTO customer_item_scores (
    run_id, run_date, brand_id, customer_external_id, external_item_id, score, n_orders, rank
  )
  SELECT run.id, run.run_date, run.brand_id,
         r.customer_id, r.item_id, r.score, r.n_orders, r.rank
  FROM ranked r
  CROSS JOIN run
  WHERE r.rank <= run.top_n
  RETURNING 1
),
-- An empty run is never published (it would wipe live scores), and a run never replaces one covering a later window
published AS (
  INSERT INTO brand_published_runs (brand_id, job_type, run_id)
  SELECT run.brand_id, run.job_type, run.id
  FROM run
  WHERE EXISTS (SELECT 1 FROM inserted)
  ON CONFLICT (brand_id, job_type) DO UPDATE
  SET run_id = EXCLUDED.run_id,
      updated_at = now()
  WHERE (SELECT cr.input_window_to FROM computation_runs cr WHERE cr.id = brand_published_runs.run_id)
     <= (SELECT run.input_window_to FROM run)
)
SELECT count(*)::int AS row_count FROM inserted;
`;

// The statement is atomic on its own; the transaction only scopes the SET LOCAL settings.
export async function calculateCustomerItemScores(
  pool: Pool,
  run: Run,
): Promise<number> {
  const client = await pool.connect();

  try {
    await client.query(BEGIN_SQL);
    const result = await client.query(SCORE_AND_PUBLISH_SQL, [run.id]);
    await client.query("COMMIT");
    return result.rows[0].row_count;
  } catch (error) {
    // Rethrow the original error, not a ROLLBACK failure on a broken connection.
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
