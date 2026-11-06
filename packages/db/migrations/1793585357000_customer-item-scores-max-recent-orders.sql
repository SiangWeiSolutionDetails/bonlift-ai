-- Up Migration
-- Existing versions keep NULL (no limit), which is what their runs did; new versions default to 8.
ALTER TABLE customer_item_scores_calculation_config_versions
    ADD COLUMN max_recent_orders int,
    ADD CONSTRAINT cisccv_max_recent_orders_check
        CHECK (max_recent_orders >= 1);

ALTER TABLE customer_item_scores_calculation_config_versions
    ALTER COLUMN max_recent_orders SET DEFAULT 8;

-- Versions are immutable, so each live brand gets a new latest version with the limit (other settings kept).
-- created_by marks the rows so the down migration can find them.
WITH
latest AS (
    SELECT DISTINCT ON (ccv.brand_id)
        ccv.brand_id,
        ccv.version,
        c.half_life_days,
        c.top_n
    FROM calculation_config_versions ccv
    JOIN customer_item_scores_calculation_config_versions c
    ON c.id = ccv.id
    JOIN brands b
    ON b.id = ccv.brand_id
    WHERE ccv.job_type = 'customer_item_scores'
    AND b.deleted_at IS NULL
    ORDER BY ccv.brand_id, ccv.version DESC
),
parent AS (
    INSERT INTO calculation_config_versions (brand_id, job_type, version, created_by)
    SELECT l.brand_id, 'customer_item_scores', l.version + 1, 'migration:1793585357000'
    FROM latest l
    RETURNING id, brand_id
)
INSERT INTO customer_item_scores_calculation_config_versions (id, half_life_days, top_n, max_recent_orders)
SELECT p.id, l.half_life_days, l.top_n, 8
FROM parent p
JOIN latest l
ON l.brand_id = p.brand_id;

-- Down Migration
-- Fails on the computation_runs foreign key once a run has used one of these versions, rather than orphaning the run.
DELETE FROM customer_item_scores_calculation_config_versions c
USING calculation_config_versions ccv
WHERE ccv.id = c.id
AND ccv.created_by = 'migration:1793585357000';

DELETE FROM calculation_config_versions
WHERE job_type = 'customer_item_scores'
AND created_by = 'migration:1793585357000';

ALTER TABLE customer_item_scores_calculation_config_versions
    DROP COLUMN max_recent_orders;
