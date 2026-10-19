-- Up Migration
CREATE TABLE computation_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES brands(id),
    outlet_id uuid NOT NULL REFERENCES outlets(id),
    job_type text NOT NULL,
    run_date date NOT NULL,
    algorithm_version text NOT NULL,
    config jsonb NOT NULL,
    input_window_from date NOT NULL,
    input_window_to date NOT NULL,
    trigger_type text NOT NULL,
    triggered_by text,
    queue_job_id text,
    status text NOT NULL,
    row_count int,
    error text,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT computation_runs_job_type_check
        CHECK (job_type IN ('outlet_item_scores', 'item_affinity', 'customer_item_scores')),
    CONSTRAINT computation_runs_trigger_type_check
        CHECK (trigger_type in ('manual', 'scheduled', 'backfill')),
    CONSTRAINT computation_runs_status_check
        CHECK (status in ('running', 'succeeded', 'failed')),
    CONSTRAINT computation_runs_window_check
        CHECK (input_window_from < input_window_to)
);

CREATE UNIQUE INDEX computation_runs_one_running_key ON computation_runs (outlet_id, job_type) WHERE status = 'running';
CREATE INDEX computation_runs_outlet_job_started_idx ON computation_runs (outlet_id, job_type, started_at DESC);

-- Down Migration
DROP TABLE computation_runs;