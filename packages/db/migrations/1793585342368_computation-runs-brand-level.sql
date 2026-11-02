-- Up Migration
ALTER TABLE computation_runs
    ALTER COLUMN outlet_id DROP NOT NULL,
    ADD CONSTRAINT computation_runs_outlet_scope_check
        CHECK ((job_type = 'customer_item_scores') = (outlet_id IS NULL));

-- computation_runs_one_running_key cannot guard these runs: NULLs are distinct in a unique index.
CREATE UNIQUE INDEX computation_runs_one_running_brand_key ON computation_runs (brand_id, job_type) WHERE status = 'running' AND outlet_id IS NULL;
CREATE INDEX computation_runs_brand_job_started_idx ON computation_runs (brand_id, job_type, started_at DESC) WHERE outlet_id IS NULL;

-- Down Migration
DROP INDEX computation_runs_brand_job_started_idx;
DROP INDEX computation_runs_one_running_brand_key;

ALTER TABLE computation_runs
    DROP CONSTRAINT computation_runs_outlet_scope_check,
    ALTER COLUMN outlet_id SET NOT NULL;
