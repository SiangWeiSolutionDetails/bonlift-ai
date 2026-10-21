-- Up Migration
CREATE TABLE calculation_config_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES brands(id),
    job_type text NOT NULL,
    version int NOT NULL DEFAULT 1,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT calculation_config_versions_job_type_check
        CHECK (job_type IN ('outlet_item_scores', 'item_affinity', 'customer_item_scores')),
    CONSTRAINT calculation_config_versions_version_check
        CHECK (version >= 1),
    CONSTRAINT calculation_config_versions_brand_job_type_version_key
        UNIQUE (brand_id, job_type, version),
    CONSTRAINT calculation_config_versions_id_job_type_key
        UNIQUE (id, job_type)
);

-- Down Migration
DROP TABLE calculation_config_versions;