-- Up Migration
ALTER TABLE order_snapshots
    ADD COLUMN order_count integer;

UPDATE order_snapshots
SET order_count = jsonb_array_length(orders);

ALTER TABLE order_snapshots
    ALTER COLUMN order_count SET NOT NULL,
    ADD CONSTRAINT order_snapshots_order_count_check
        CHECK (order_count >= 0);

-- Down Migration
ALTER TABLE order_snapshots
    DROP COLUMN order_count;
