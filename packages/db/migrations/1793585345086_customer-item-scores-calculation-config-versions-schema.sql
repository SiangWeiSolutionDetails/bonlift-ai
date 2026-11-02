-- Up Migration
CREATE TABLE customer_item_scores_calculation_config_versions (
    id uuid PRIMARY KEY,
    job_type text NOT NULL DEFAULT 'customer_item_scores',
    half_life_days int NOT NULL DEFAULT 14,
    top_n int NOT NULL DEFAULT 20,
    CONSTRAINT cisccv_job_type_check
        CHECK (job_type = 'customer_item_scores'),
    CONSTRAINT cisccv_half_life_days_check
        CHECK (half_life_days >= 1),
    CONSTRAINT cisccv_top_n_check
        CHECK (top_n >= 1),
    CONSTRAINT cisccv_parent_fkey
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
        'customer_item_scores'
    FROM brands b
    RETURNING id
)
INSERT INTO customer_item_scores_calculation_config_versions (
    id
)
SELECT
    p.id
FROM parent p;

-- Down Migration
DROP TABLE customer_item_scores_calculation_config_versions;

DELETE FROM calculation_config_versions
WHERE job_type = 'customer_item_scores';
