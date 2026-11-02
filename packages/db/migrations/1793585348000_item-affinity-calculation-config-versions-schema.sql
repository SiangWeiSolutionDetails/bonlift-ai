-- Up Migration
CREATE TABLE item_affinity_calculation_config_versions (
    id uuid PRIMARY KEY,
    job_type text NOT NULL DEFAULT 'item_affinity',
    top_n int NOT NULL DEFAULT 10,
    min_pair_orders int NOT NULL DEFAULT 10,
    max_order_items int NOT NULL DEFAULT 20,
    CONSTRAINT iaccv_job_type_check
        CHECK (job_type = 'item_affinity'),
    CONSTRAINT iaccv_top_n_check
        CHECK (top_n >= 1),
    CONSTRAINT iaccv_min_pair_orders_check
        CHECK (min_pair_orders >= 1),
    CONSTRAINT iaccv_max_order_items_check
        CHECK (max_order_items >= 1),
    CONSTRAINT iaccv_parent_fkey
        FOREIGN KEY (id, job_type) REFERENCES calculation_config_versions (id, job_type)
);

WITH
parent AS (
    INSERT INTO calculation_config_versions (
        brand_id,
        job_type
    )
    SELECT
        b.id,
        'item_affinity'
    FROM brands b
    RETURNING id
)
INSERT INTO item_affinity_calculation_config_versions (
    id
)
SELECT
    p.id
FROM parent p;

-- Down Migration
DROP TABLE item_affinity_calculation_config_versions;

DELETE FROM calculation_config_versions
WHERE job_type = 'item_affinity';
