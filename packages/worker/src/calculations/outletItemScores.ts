import { Pool } from "pg";
import { Run } from "../runs/runs.repository.js";

// SET LOCAL only lasts until COMMIT/ROLLBACK. jit: the planner overestimates jsonb_array_elements rows (100 each),
// so it would JIT-compile a ~80 ms query for 10–100 ms. work_mem: the GROUP BY hash spills to disk at the 4 MB default.
const BEGIN_SQL = `BEGIN; SET LOCAL jit = off; SET LOCAL work_mem = '32MB'`;

// $1 = run id. Config, brand, outlet and window all come from the run row, so the statement scores exactly what the run recorded.
// top_n applies to each daypart's main and addon lists separately.
const SCORE_AND_PUBLISH_SQL = `
WITH run AS (
  SELECT r.id, r.brand_id, r.outlet_id, r.job_type, r.run_date,
         r.input_window_from, r.input_window_to,
         c.half_life_days, c.top_n, c.dayparts
  FROM computation_runs r
  JOIN outlet_item_scores_calculation_config_versions c
    ON c.id = r.calculation_config_version_id
  WHERE r.id = $1
),
-- Every configured daypart, plus a whole-day list (P3-D6) for requests that send no daypart
dayparts AS (
  SELECT d.name, d.start, d."end"
  FROM run
  CROSS JOIN LATERAL jsonb_to_recordset(run.dayparts) AS d(name text, start time, "end" time)
  UNION ALL
  SELECT 'all_day', NULL, NULL
  FROM run
),
-- One row per order; a duplicate orderId on the same date is kept once (P3-D4)
orders AS (
  SELECT DISTINCT ON (os.order_date, o->>'orderId')
         os.order_date,
         o->>'orderId'                      AS order_id,
         (o->>'orderedAt')::timestamp::time AS ordered_time,
         o->'lines'                         AS lines
  FROM run
  JOIN order_snapshots os
    ON os.outlet_id = run.outlet_id
   AND os.order_date >= run.input_window_from
   AND os.order_date <= run.input_window_to
  CROSS JOIN LATERAL jsonb_array_elements(os.orders) AS o
  ORDER BY os.order_date, o->>'orderId'
),
-- One row per item: each line as a main, plus its addons as addons; modifiers ignored (P3-D1).
-- The role comes from where the item sits, so an item sold both alone and as an addon is ranked in both lists (S3-04).
items AS (
  SELECT o.order_date,
         o.order_id,
         o.ordered_time,
         x.item_role,
         x.i->>'itemId'               AS item_id,
         (x.i->>'qty')::numeric       AS qty,
         (x.i->>'unitPrice')::numeric AS unit_price
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.lines) AS l
  CROSS JOIN LATERAL (
    SELECT l, 'main'
    UNION ALL
    SELECT a, 'addon' FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(l->'addons') = 'array' THEN l->'addons' END
    ) AS a
  ) AS x(i, item_role)
),
-- One row per (order, role, item) with net qty > 0; negative prices dropped (P3-D7)
order_items AS (
  SELECT order_date, order_id, ordered_time, item_role, item_id
  FROM items
  WHERE unit_price >= 0
  GROUP BY order_date, order_id, ordered_time, item_role, item_id
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
-- A daypart with start > end crosses midnight; orders outside every daypart only count towards all_day (P3-D6)
scored_items AS (
  SELECT oi.order_date, oi.order_id, oi.item_role, oi.item_id, d.name AS daypart, w.weight
  FROM order_items oi
  JOIN date_weights w USING (order_date)
  JOIN dayparts d
    ON d.start IS NULL
    OR CASE WHEN d.start < d."end"
            THEN oi.ordered_time >= d.start AND oi.ordered_time < d."end"
            ELSE oi.ordered_time >= d.start OR  oi.ordered_time < d."end"
       END
),
-- Denominator: weight of every non-empty order in the daypart, each order once, shared by both roles so an addon's
-- score is the share of all orders that added it
daypart_totals AS (
  SELECT daypart, sum(weight) AS total_weight
  FROM (SELECT DISTINCT order_date, order_id, daypart, weight FROM scored_items) o
  GROUP BY daypart
),
item_scores AS (
  SELECT daypart, item_role, item_id, sum(weight) AS weight, count(*) AS n_orders
  FROM scored_items
  GROUP BY daypart, item_role, item_id
),
ranked AS (
  SELECT s.daypart, s.item_role, s.item_id, s.weight / t.total_weight AS score, s.n_orders,
         row_number() OVER (
           PARTITION BY s.daypart, s.item_role
           ORDER BY s.weight / t.total_weight DESC, s.n_orders DESC, s.item_id
         ) AS rank
  FROM item_scores s
  JOIN daypart_totals t USING (daypart)
),
inserted AS (
  INSERT INTO outlet_item_scores (
    run_id, run_date, brand_id, outlet_id, external_item_id, daypart, item_role, score, n_orders, rank
  )
  SELECT run.id, run.run_date, run.brand_id, run.outlet_id,
         r.item_id, r.daypart, r.item_role, r.score, r.n_orders, r.rank
  FROM ranked r
  CROSS JOIN run
  WHERE r.rank <= run.top_n
  RETURNING 1
),
-- An empty run is never published (it would wipe live scores), and a run never replaces one covering a later window
published AS (
  INSERT INTO published_runs (outlet_id, job_type, run_id)
  SELECT run.outlet_id, run.job_type, run.id
  FROM run
  WHERE EXISTS (SELECT 1 FROM inserted)
  ON CONFLICT (outlet_id, job_type) DO UPDATE
  SET run_id = EXCLUDED.run_id,
      updated_at = now()
  WHERE (SELECT cr.input_window_to FROM computation_runs cr WHERE cr.id = published_runs.run_id)
     <= (SELECT run.input_window_to FROM run)
)
SELECT count(*)::int AS row_count FROM inserted;
`;

// The statement is atomic on its own; the transaction only scopes the SET LOCAL settings.
export async function calculateOutletItemScores(
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
