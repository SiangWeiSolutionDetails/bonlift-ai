-- Up Migration
-- The items an identified customer was last shown, latest showing only. Serving moves an item shown within the brand's
-- repeat cooldown below the ones not shown, and accepting it deletes the row. Rows are bounded by customers times
-- served items and never deleted for age: the cooldown is set per brand, so a longer cooldown must still find older
-- showings.
CREATE TABLE customer_item_exposures (
    brand_id uuid NOT NULL REFERENCES brands(id),
    -- Hashed like customer_item_rejections.customer_external_id.
    customer_external_id text NOT NULL,
    external_item_id text NOT NULL,
    last_shown_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_id, customer_external_id, external_item_id)
);

-- Down Migration
DROP TABLE customer_item_exposures;
