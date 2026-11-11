-- Up Migration
ALTER TABLE serving_config_versions
    DROP COLUMN min_pair_sample,
    DROP COLUMN strong_pairing_lift;

-- Down Migration
-- Old rows get the defaults; the original values cannot be restored.
ALTER TABLE serving_config_versions
    ADD COLUMN min_pair_sample int NOT NULL DEFAULT 50,
    ADD COLUMN strong_pairing_lift numeric(6, 2) NOT NULL DEFAULT 2,
    ADD CONSTRAINT serving_config_versions_min_pair_sample_check
        CHECK (min_pair_sample >= 1),
    ADD CONSTRAINT serving_config_versions_strong_pairing_lift_check
        CHECK (strong_pairing_lift >= 1);
