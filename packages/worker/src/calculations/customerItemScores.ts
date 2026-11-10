import { Pool } from "pg";
import { Run } from "../runs/runs.repository.js";

// SET LOCAL only lasts until COMMIT/ROLLBACK. Same reasons as outletItemScores: jit overhead from the
// planner's jsonb_array_elements estimate, and a GROUP BY hash that spills at the default work_mem.
const BEGIN_SQL = `BEGIN; SET LOCAL jit = off; SET LOCAL work_mem = '64MB'`;

// $1 = run id. Config, brand and window all come from the run row, so the statement scores exactly what the run recorded.
const SCORE_AND_PUBLISH_SQL = `
WITH run AS (
  SELECT r.id, r.brand_id, r.job_type, r.run_date, r.created_at,
         r.input_window_from, r.input_window_to,
         c.half_life_days, c.top_n, c.max_recent_orders
  FROM computation_runs r
  JOIN customer_item_scores_calculation_config_versions c
    ON c.id = r.calculation_config_version_id
  WHERE r.id = $1
),
-- Dayparts are defined once per brand, in the outlet item scores config. The version that was latest when the run was
-- created is used: versions never change, so re-running the statement reads the same dayparts.
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
-- Every configured daypart, plus an all_day list for requests that send no daypart
dayparts AS (
  SELECT d.name, d.start, d."end"
  FROM daypart_config
  CROSS JOIN LATERAL jsonb_to_recordset(daypart_config.dayparts) AS d(name text, start time, "end" time)
  UNION ALL
  SELECT 'all_day', NULL, NULL
),
-- One row per identified order. outlet_id is in the key because an orderId is only unique per outlet and date.
-- Inactive outlets are included: that history is still the customer's; deleted outlets are not. Blank IDs are anonymous and surrounding
-- whitespace is dropped, so "C1 " is C1. If a repeated orderId disagrees, the ORDER BY tiebreak picks the same copy every run.
-- Only hashed ids (CUS-02) are scored: a plaintext id stored before hashing is treated as anonymous, so it never becomes a
-- second profile for the same customer or reaches customer_item_scores.
orders AS (
  SELECT DISTINCT ON (os.outlet_id, os.order_date, o->>'orderId')
         os.outlet_id,
         os.order_date,
         o->>'orderId'                          AS order_id,
         btrim(o->>'customerId', E' \\t\\r\\n') AS customer_id,
         (o->>'orderedAt')::timestamp::time     AS ordered_time,
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
  WHERE starts_with(btrim(o->>'customerId', E' \\t\\r\\n'), 'h1:')
  ORDER BY os.outlet_id, os.order_date, o->>'orderId', customer_id, lines, ordered_time
),
-- One row per item: each line plus its addons; modifiers ignored (P3-D1)
items AS (
  SELECT o.outlet_id,
         o.order_date,
         o.order_id,
         o.customer_id,
         o.ordered_time,
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
  SELECT outlet_id, order_date, order_id, customer_id, ordered_time, item_id
  FROM items
  WHERE unit_price >= 0
  GROUP BY outlet_id, order_date, order_id, customer_id, ordered_time, item_id
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
-- Same daypart match as outlet item scores: start > end crosses midnight. An order outside every daypart, or with no
-- orderedAt, only counts towards all_day.
daypart_items AS (
  SELECT oi.outlet_id, oi.order_date, oi.order_id, oi.customer_id, oi.ordered_time, oi.item_id, d.name AS daypart, w.weight
  FROM order_items oi
  JOIN date_weights w USING (order_date)
  JOIN dayparts d
    ON d.start IS NULL
    OR CASE WHEN d.start < d."end"
            THEN oi.ordered_time >= d.start AND oi.ordered_time < d."end"
            ELSE oi.ordered_time >= d.start OR  oi.ordered_time < d."end"
       END
),
-- A customer's newest orders first within each daypart (S4-02); NULL max_recent_orders (older versions) keeps every order.
-- The trailing keys only make ties deterministic.
recent_orders AS (
  SELECT outlet_id, order_date, order_id, customer_id, daypart
  FROM (
    SELECT o.*,
           row_number() OVER (
             PARTITION BY o.customer_id, o.daypart
             ORDER BY o.order_date DESC, o.ordered_time DESC NULLS LAST, o.outlet_id, o.order_id
           ) AS recency
    FROM (SELECT DISTINCT outlet_id, order_date, order_id, customer_id, ordered_time, daypart FROM daypart_items) o
  ) ranked_orders
  CROSS JOIN run
  WHERE run.max_recent_orders IS NULL
     OR ranked_orders.recency <= run.max_recent_orders
),
scored_items AS (
  SELECT i.outlet_id, i.order_date, i.order_id, i.customer_id, i.item_id, i.daypart, i.weight
  FROM daypart_items i
  JOIN recent_orders USING (outlet_id, order_date, order_id, customer_id, daypart)
),
-- Denominator: weight of every non-empty order of the customer in the daypart, each order once
customer_totals AS (
  SELECT customer_id, daypart, sum(weight) AS total_weight
  FROM (SELECT DISTINCT outlet_id, order_date, order_id, customer_id, daypart, weight FROM scored_items) o
  GROUP BY customer_id, daypart
),
item_scores AS (
  SELECT customer_id, daypart, item_id, sum(weight) AS weight, count(*) AS n_orders
  FROM scored_items
  GROUP BY customer_id, daypart, item_id
),
ranked AS (
  SELECT s.customer_id, s.daypart, s.item_id, s.weight / t.total_weight AS score, s.n_orders,
         row_number() OVER (
           PARTITION BY s.customer_id, s.daypart
           ORDER BY s.weight / t.total_weight DESC, s.n_orders DESC, s.item_id
         ) AS rank
  FROM item_scores s
  JOIN customer_totals t USING (customer_id, daypart)
),
inserted AS (
  INSERT INTO customer_item_scores (
    run_id, run_date, brand_id, customer_external_id, daypart, external_item_id, score, n_orders, rank
  )
  SELECT run.id, run.run_date, run.brand_id,
         r.customer_id, r.daypart, r.item_id, r.score, r.n_orders, r.rank
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
