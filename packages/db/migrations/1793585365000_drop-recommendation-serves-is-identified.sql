-- Up Migration
-- Only identified customers give feedback, so only their serves are recorded: anonymous serves recorded before that
-- rule are removed, and is_identified, now always true, goes with them.
DELETE FROM recommendation_serves
WHERE NOT is_identified;

ALTER TABLE recommendation_serves
    DROP COLUMN is_identified;

-- Down Migration
-- The deleted anonymous serves cannot be restored.
ALTER TABLE recommendation_serves
    ADD COLUMN is_identified boolean NOT NULL DEFAULT true;
