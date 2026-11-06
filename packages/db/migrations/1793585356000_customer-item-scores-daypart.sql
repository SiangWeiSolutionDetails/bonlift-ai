-- Up Migration
-- Rows calculated before dayparts were added cover the whole day, so they become the all_day list.
ALTER TABLE customer_item_scores
    ADD COLUMN daypart text NOT NULL DEFAULT 'all_day';

ALTER TABLE customer_item_scores
    ALTER COLUMN daypart DROP DEFAULT;

ALTER TABLE customer_item_scores
    DROP CONSTRAINT customer_item_scores_pkey,
    ADD PRIMARY KEY (run_id, customer_external_id, daypart, external_item_id);

-- Down Migration
DELETE FROM customer_item_scores
WHERE daypart <> 'all_day';

ALTER TABLE customer_item_scores
    DROP CONSTRAINT customer_item_scores_pkey,
    ADD PRIMARY KEY (run_id, customer_external_id, external_item_id);

ALTER TABLE customer_item_scores
    DROP COLUMN daypart;
