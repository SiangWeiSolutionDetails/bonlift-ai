-- Up Migration
ALTER TABLE item_affinity_calculation_config_versions
    ALTER COLUMN min_pair_orders SET DEFAULT 1,
    ALTER COLUMN max_order_items SET DEFAULT 50;

-- Versions are immutable, so each live brand gets a new latest version (top_n kept); a brand already on 1/50 is skipped.
-- created_by marks the rows so the down migration can find them.
WITH
latest AS (
    SELECT DISTINCT ON (ccv.brand_id)
        ccv.brand_id,
        ccv.version,
        c.top_n,
        c.min_pair_orders,
        c.max_order_items
    FROM calculation_config_versions ccv
    JOIN item_affinity_calculation_config_versions c
    ON c.id = ccv.id
    JOIN brands b
    ON b.id = ccv.brand_id
    WHERE ccv.job_type = 'item_affinity'
    AND b.deleted_at IS NULL
    ORDER BY ccv.brand_id, ccv.version DESC
),
parent AS (
    INSERT INTO calculation_config_versions (brand_id, job_type, version, created_by)
    SELECT l.brand_id, 'item_affinity', l.version + 1, 'migration:1793585355000'
    FROM latest l
    WHERE (l.min_pair_orders, l.max_order_items) <> (1, 50)
    RETURNING id, brand_id
)
INSERT INTO item_affinity_calculation_config_versions (id, top_n, min_pair_orders, max_order_items)
SELECT p.id, l.top_n, 1, 50
FROM parent p
JOIN latest l
ON l.brand_id = p.brand_id;

-- Down Migration
-- Fails on the computation_runs foreign key once a run has used one of these versions, rather than orphaning the run.
DELETE FROM item_affinity_calculation_config_versions c
USING calculation_config_versions ccv
WHERE ccv.id = c.id
AND ccv.created_by = 'migration:1793585355000';

DELETE FROM calculation_config_versions
WHERE job_type = 'item_affinity'
AND created_by = 'migration:1793585355000';

ALTER TABLE item_affinity_calculation_config_versions
    ALTER COLUMN min_pair_orders SET DEFAULT 10,
    ALTER COLUMN max_order_items SET DEFAULT 20;
