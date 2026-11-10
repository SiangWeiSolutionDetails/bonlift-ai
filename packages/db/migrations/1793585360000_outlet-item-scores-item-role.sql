-- Up Migration
-- Rows calculated before roles existed ranked mains and add-ons together; they are labelled main until the next run
-- replaces them.
ALTER TABLE outlet_item_scores
    ADD COLUMN item_role text NOT NULL DEFAULT 'main',
    ADD CONSTRAINT outlet_item_scores_item_role_check
        CHECK (item_role IN ('main', 'addon'));

ALTER TABLE outlet_item_scores
    ALTER COLUMN item_role DROP DEFAULT;

-- item_role sits before the item so serving's (run, outlet, daypart, role) lookup is a primary key prefix scan.
ALTER TABLE outlet_item_scores
    DROP CONSTRAINT outlet_item_scores_pkey,
    ADD PRIMARY KEY (run_id, outlet_id, daypart, item_role, external_item_id);

-- Down Migration
DELETE FROM outlet_item_scores
WHERE item_role <> 'main';

ALTER TABLE outlet_item_scores
    DROP CONSTRAINT outlet_item_scores_pkey,
    ADD PRIMARY KEY (run_id, outlet_id, daypart, external_item_id);

ALTER TABLE outlet_item_scores
    DROP COLUMN item_role;
