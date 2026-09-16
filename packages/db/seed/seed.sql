-- Deterministic dev seed data. Replaces the old packages/db/src/seed/*.ts generator —
-- this is scaffold/fixture setup, not the SQL logic this project exists to teach.
--
-- Run with:
--   docker exec -i ai-services-postgres-1 psql -U ai_services -d ai_services_dev < packages/db/seed/seed.sql
--
-- Idempotent: truncates and re-inserts every time it's run. Does NOT touch
-- outlet_item_scores/customer_item_scores (those are worker output, not seed input) —
-- re-run the relevant `rescore` command after reseeding if you need fresh scores.
--
-- Postgres gotcha this script works around: random() called inside a subquery --
-- including inside a LATERAL wrapping a SELECT with no real correlation to the outer
-- row -- can be evaluated once and cached/reused across every outer row, instead of
-- freshly per row (confirmed empirically: `... CROSS JOIN LATERAL (SELECT random()) r`
-- gave the identical value for every row). The safe pattern used throughout below:
-- compute every random() value as a plain column in one flat SELECT over a real row
-- source (outlets/generate_series, never a nested subquery), then use that
-- already-computed value in later deterministic joins/lookups. A LATERAL join to a
-- set-returning function like generate_series(1, some_column) is unaffected by this --
-- that's a different, safe mechanism.

\set outlets_per_brand 2
\set items_per_brand 10
\set customer_count 10
\set days_of_history 30
\set orders_per_outlet_per_day 10

SET max_parallel_workers_per_gather = 0;
SELECT setseed(0.88);

BEGIN;

TRUNCATE order_lines, orders, customers, outlets, brands RESTART IDENTITY CASCADE;

-- brands
INSERT INTO brands (name) VALUES
  ('Urban Kitchen'),
  ('Noodle House'),
  ('Cafe Verde');

-- outlets: N per brand
INSERT INTO outlets (name, brand_id)
SELECT b.name || ' #' || n, b.id
FROM brands b
CROSS JOIN generate_series(1, :outlets_per_brand) AS n;

-- customers: plain rows, cohort behavior derived inline below, never persisted
CREATE TEMP TABLE _customers AS
WITH inserted AS (
  INSERT INTO customers (id)
  SELECT gen_random_uuid() FROM generate_series(1, :customer_count)
  RETURNING id
)
SELECT id, ROW_NUMBER() OVER () AS rn FROM inserted;

-- items: per-brand catalog, Zipf-weighted popularity (1/rank), never persisted as its
-- own table -- only used here to generate realistic order_lines, same as the old generator.
CREATE TEMP TABLE _items AS
SELECT
  b.id AS brand_id,
  rank::text AS item_ref_id,
  'Item ' || rank AS item_name,
  (ARRAY['mains', 'sides', 'drinks', 'desserts'])[1 + ((rank - 1) % 4)] AS item_category,
  round((5 + random() * 20)::numeric, 2) AS unit_price,
  1.0 / rank AS popularity_weight
FROM brands b
CROSS JOIN generate_series(1, :items_per_brand) AS rank;

-- item cumulative-weight table (a CDF), for weighted-random selection per brand
CREATE TEMP TABLE _item_cdf AS
SELECT
  brand_id, item_ref_id, item_name, item_category, unit_price,
  SUM(popularity_weight) OVER (PARTITION BY brand_id ORDER BY item_ref_id) AS cum_weight,
  SUM(popularity_weight) OVER (PARTITION BY brand_id) AS total_weight
FROM _items;

-- customer cohort weight per day (a CDF): "loyal" orders consistently, "at_risk" only
-- in the older half of history (used to order a lot, went quiet recently), "occasional"
-- is rare and flat throughout. Cohort is derived from row number modulo 3, not persisted.
CREATE TEMP TABLE _customer_cdf AS
WITH weighted AS (
  SELECT
    c.id AS customer_id,
    d.day,
    CASE (c.rn % 3)
      WHEN 1 THEN 10.0
      WHEN 2 THEN CASE WHEN d.day < :days_of_history / 2.0 THEN 0.5 ELSE 8.0 END
      ELSE 1.0
    END AS weight
  FROM _customers c
  CROSS JOIN generate_series(0, :days_of_history - 1) AS d(day)
)
SELECT
  day, customer_id,
  SUM(weight) OVER (PARTITION BY day ORDER BY customer_id) AS cum_weight,
  SUM(weight) OVER (PARTITION BY day) AS total_weight
FROM weighted;

-- order slots: one flat row per (outlet, day, order-slot), with every random() value
-- this order needs computed directly here (per the gotcha note above) -- walkin_roll
-- decides walk-in vs customer, customer_roll is the weighted-pick threshold, line_count
-- is how many order_lines this order will get.
CREATE TEMP TABLE _order_slots AS
SELECT
  gen_random_uuid() AS id,
  o.id AS outlet_id,
  o.brand_id,
  d.day,
  (now() - (d.day || ' days')::interval - (random() * interval '1 day')) AS ordered_at,
  random() AS walkin_roll,
  random() AS customer_roll,
  1 + floor(random() * 4)::int AS line_count
FROM outlets o
CROSS JOIN generate_series(0, :days_of_history - 1) AS d(day)
CROSS JOIN generate_series(1, :orders_per_outlet_per_day) AS slot;

-- pick each order's customer (or none) using the precomputed rolls above -- this LATERAL
-- only reads already-computed plain columns, no random() calls inside it, so it isn't
-- subject to the caching gotcha.
CREATE TEMP TABLE _orders AS
SELECT
  os.id, os.outlet_id, os.brand_id, os.ordered_at,
  CASE WHEN os.walkin_roll < 0.6 THEN picked.customer_id ELSE NULL END AS customer_id,
  os.line_count
FROM _order_slots os
LEFT JOIN LATERAL (
  SELECT cdf.customer_id
  FROM _customer_cdf cdf
  WHERE cdf.day = os.day AND cdf.cum_weight >= os.customer_roll * cdf.total_weight
  ORDER BY cdf.cum_weight
  LIMIT 1
) AS picked ON true;

INSERT INTO orders (id, outlet_id, customer_id, ordered_at)
SELECT id, outlet_id, customer_id, ordered_at FROM _orders;

-- order_lines: fan out to line_count rows per order via a LATERAL join to
-- generate_series (a real per-row-correlated set-returning function call, not a nested
-- random() subquery -- safe), each with its own item-pick threshold and quantity rolled
-- as plain columns in this same flat query.
CREATE TEMP TABLE _order_line_slots AS
SELECT
  ord.id AS order_id,
  ord.brand_id,
  gs.line_n,
  random() AS item_draw,
  1 + floor(random() * 3)::int AS qty
FROM _orders ord
CROSS JOIN LATERAL generate_series(1, ord.line_count) AS gs(line_n);

INSERT INTO order_lines (order_id, item_ref_id, item_name, item_category, qty, unit_price, subtotal)
SELECT
  ols.order_id,
  picked.item_ref_id,
  picked.item_name,
  picked.item_category,
  ols.qty,
  picked.unit_price,
  round((ols.qty * picked.unit_price)::numeric, 2)
FROM _order_line_slots ols
LEFT JOIN LATERAL (
  SELECT item_ref_id, item_name, item_category, unit_price
  FROM _item_cdf
  WHERE brand_id = ols.brand_id AND cum_weight >= ols.item_draw * total_weight
  ORDER BY cum_weight
  LIMIT 1
) AS picked ON true;

COMMIT;
