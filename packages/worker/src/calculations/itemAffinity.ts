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
         c.top_n, c.min_pair_orders, c.max_order_items
  FROM computation_runs r
  JOIN item_affinity_calculation_config_versions c
    ON c.id = r.calculation_config_version_id
  WHERE r.id = $1
),
-- One row per order. outlet_id is in the key because an orderId is only unique per outlet and date.
-- Inactive outlets are included: that history is still the brand's; deleted outlets are not. If a repeated orderId disagrees,
-- the ORDER BY tiebreak picks the same copy every run.
orders AS (
  SELECT DISTINCT ON (os.outlet_id, os.order_date, o->>'orderId')
         os.outlet_id,
         os.order_date,
         o->>'orderId' AS order_id,
         o->'lines'    AS lines
  FROM run
  JOIN outlets ot
    ON ot.brand_id = run.brand_id
   AND ot.deleted_at IS NULL
  JOIN order_snapshots os
    ON os.outlet_id = ot.id
   AND os.order_date >= run.input_window_from
   AND os.order_date <  run.input_window_to
  CROSS JOIN LATERAL jsonb_array_elements(os.orders) AS o
  ORDER BY os.outlet_id, os.order_date, o->>'orderId', lines
),
-- Top-level lines only: an addon is a choice inside its parent line, so it would pair with that parent at 100%
items AS (
  SELECT o.outlet_id,
         o.order_date,
         o.order_id,
         l->>'itemId'               AS item_id,
         NULLIF(l->>'itemName', '') AS item_name,
         (l->>'qty')::numeric       AS qty,
         (l->>'unitPrice')::numeric AS unit_price
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.lines) AS l
),
-- A free line is not something to upsell; a line netting to zero was removed from the order
order_items AS (
  SELECT outlet_id, order_date, order_id, item_id,
         count(*) OVER (PARTITION BY outlet_id, order_date, order_id) AS order_size
  FROM items
  WHERE unit_price > 0
  GROUP BY outlet_id, order_date, order_id, item_id
  HAVING sum(qty) > 0
),
-- Pairs grow with the square of the order's size, so the largest group bills are left out of every count
counted_items AS (
  SELECT oi.outlet_id, oi.order_date, oi.order_id, oi.item_id
  FROM order_items oi
  CROSS JOIN run
  WHERE oi.order_size <= run.max_order_items
),
-- MATERIALIZED stops the planner from inlining it into the join and recounting every order once per pair
order_total AS MATERIALIZED (
  SELECT count(*) AS n_orders
  FROM (SELECT DISTINCT outlet_id, order_date, order_id FROM counted_items) o
),
item_counts AS (
  SELECT item_id, count(*) AS n_item
  FROM counted_items
  GROUP BY item_id
),
-- Both directions, because confidence differs by direction and serving looks up by the cart item
pairs AS (
  SELECT a.item_id AS item_a, b.item_id AS item_b, count(*) AS n_pair
  FROM counted_items a
  JOIN counted_items b
    ON b.outlet_id = a.outlet_id
   AND b.order_date = a.order_date
   AND b.order_id = a.order_id
   AND b.item_id <> a.item_id
  GROUP BY a.item_id, b.item_id
  HAVING count(*) >= (SELECT min_pair_orders FROM run)
),
scored AS (
  SELECT p.item_a,
         p.item_b,
         p.n_pair,
         ca.n_item AS n_item_a,
         p.n_pair::numeric / ca.n_item AS confidence,
         (p.n_pair::numeric * t.n_orders) / (ca.n_item * cb.n_item) AS lift
  FROM pairs p
  JOIN item_counts ca ON ca.item_id = p.item_a
  JOIN item_counts cb ON cb.item_id = p.item_b
  CROSS JOIN order_total t
),
ranked AS (
  SELECT s.*,
         row_number() OVER (
           PARTITION BY s.item_a
           ORDER BY s.confidence DESC, s.lift DESC, s.item_b
         ) AS rank
  FROM scored s
  WHERE s.lift > 1
),
-- Latest non-blank name in the window, so a renamed item shows its current name
names AS (
  SELECT DISTINCT ON (item_id) item_id, item_name
  FROM items
  ORDER BY item_id, item_name IS NULL, order_date DESC, item_name
),
inserted AS (
  INSERT INTO item_affinity_scores (
    run_id, run_date, brand_id, item_a, item_a_name, item_b, item_b_name,
    n_pair, n_item_a, confidence, lift, rank
  )
  SELECT run.id, run.run_date, run.brand_id,
         r.item_a, na.item_name, r.item_b, nb.item_name,
         r.n_pair, r.n_item_a, r.confidence, r.lift, r.rank
  FROM ranked r
  CROSS JOIN run
  JOIN names na ON na.item_id = r.item_a
  JOIN names nb ON nb.item_id = r.item_b
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
export async function calculateItemAffinity(
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
