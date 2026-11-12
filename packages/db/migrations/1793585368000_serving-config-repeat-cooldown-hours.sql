-- Up Migration
-- 0 means items already shown are not moved down.
ALTER TABLE serving_config_versions
    ADD COLUMN repeat_cooldown_hours int NOT NULL DEFAULT 24,
    ADD CONSTRAINT serving_config_versions_repeat_cooldown_hours_check
        CHECK (repeat_cooldown_hours BETWEEN 0 AND 720);

-- Down Migration
ALTER TABLE serving_config_versions
    DROP COLUMN repeat_cooldown_hours;
