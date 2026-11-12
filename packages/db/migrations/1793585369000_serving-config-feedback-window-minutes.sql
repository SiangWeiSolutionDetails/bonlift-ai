-- Up Migration
-- How long after a serve feedback still counts; a shown item is only moved down once this has passed, so the
-- cooldown must outlast it for rotation to happen at all.
ALTER TABLE serving_config_versions
    ADD COLUMN feedback_window_minutes int NOT NULL DEFAULT 120,
    ADD CONSTRAINT serving_config_versions_feedback_window_minutes_check
        CHECK (feedback_window_minutes BETWEEN 5 AND 1440),
    ADD CONSTRAINT serving_config_versions_cooldown_after_feedback_window_check
        CHECK (repeat_cooldown_hours = 0 OR repeat_cooldown_hours * 60 > feedback_window_minutes);

-- Down Migration
ALTER TABLE serving_config_versions
    DROP CONSTRAINT serving_config_versions_cooldown_after_feedback_window_check,
    DROP COLUMN feedback_window_minutes;
