-- Up Migration
CREATE TABLE published_runs (
    outlet_id uuid NOT NULL REFERENCES outlets(id),
    job_type text NOT NULL,
    run_id uuid NOT NULL REFERENCES computation_runs(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT published_runs_job_type_check
        CHECK (job_type IN ('outlet_item_scores', 'item_affinity', 'customer_item_scores')),
    PRIMARY KEY (outlet_id, job_type)
);

-- Down Migration
DROP TABLE published_runs;