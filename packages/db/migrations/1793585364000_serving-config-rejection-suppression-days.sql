-- Up Migration
-- 0 means rejected items are not suppressed.
ALTER TABLE serving_config_versions
    ADD COLUMN rejection_suppression_days int NOT NULL DEFAULT 30,
    ADD CONSTRAINT serving_config_versions_rejection_suppression_days_check
        CHECK (rejection_suppression_days BETWEEN 0 AND 365);

-- Down Migration
ALTER TABLE serving_config_versions
    DROP COLUMN rejection_suppression_days;
