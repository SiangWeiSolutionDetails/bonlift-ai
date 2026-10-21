-- Up Migration
ALTER TABLE computation_runs
    ADD COLUMN calculation_config_version_id uuid NOT NULL,
    ADD CONSTRAINT computation_runs_calculation_config_version_fkey
        FOREIGN KEY (calculation_config_version_id, job_type)
        REFERENCES calculation_config_versions(id, job_type);

-- Down Migration
ALTER TABLE computation_runs
    DROP COLUMN calculation_config_version_id;