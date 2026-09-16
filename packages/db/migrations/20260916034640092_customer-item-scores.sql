-- Up Migration
CREATE TABLE IF NOT EXISTS customer_item_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    brand_id UUID NOT NULL REFERENCES brands(id),
    item_ref_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_category VARCHAR(255) NOT NULL,
    score NUMERIC NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL,
    UNIQUE(customer_id, brand_id, item_ref_id)
);

-- Down Migration
DROP TABLE IF EXISTS customer_item_scores;