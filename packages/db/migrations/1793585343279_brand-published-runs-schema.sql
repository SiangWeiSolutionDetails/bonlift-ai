-- Up Migration
CREATE TABLE brand_published_runs (
    brand_id uuid NOT NULL REFERENCES brands(id),
    job_type text NOT NULL,
    run_id uuid NOT NULL REFERENCES computation_runs(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT brand_published_runs_job_type_check
        CHECK (job_type IN ('outlet_item_scores', 'item_affinity', 'customer_item_scores')),
    PRIMARY KEY (brand_id, job_type)
);

-- Down Migration
DROP TABLE brand_published_runs;
