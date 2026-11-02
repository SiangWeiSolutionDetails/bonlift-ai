-- Up Migration
ALTER TABLE computation_runs
    DROP CONSTRAINT computation_runs_outlet_scope_check,
    ADD CONSTRAINT computation_runs_outlet_scope_check
        CHECK ((job_type IN ('customer_item_scores', 'item_affinity')) = (outlet_id IS NULL));

-- Down Migration
ALTER TABLE computation_runs
    DROP CONSTRAINT computation_runs_outlet_scope_check,
    ADD CONSTRAINT computation_runs_outlet_scope_check
        CHECK ((job_type = 'customer_item_scores') = (outlet_id IS NULL));
