-- Up Migration
-- The items an identified customer rejected, latest rejection only. Serving skips an item rejected within the brand's
-- rejection window, and accepting it again deletes the row. Rows are never deleted for age: the window is set per
-- brand, so a longer window must still find older rejections.
CREATE TABLE customer_item_rejections (
    brand_id uuid NOT NULL REFERENCES brands(id),
    -- Hashed like customer_item_scores.customer_external_id.
    customer_external_id text NOT NULL,
    external_item_id text NOT NULL,
    rejected_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_id, customer_external_id, external_item_id)
);

-- Down Migration
DROP TABLE customer_item_rejections;
