-- Up Migration
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS outlets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    brand_id UUID NOT NULL REFERENCES brands(id)
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id),
    customer_id UUID REFERENCES customers(id),
    ordered_at TIMESTAMPTZ NOT NULL 
);

CREATE TABLE IF NOT EXISTS order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    item_ref_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_category VARCHAR(255) NOT NULL,
    qty NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS outlet_item_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id),
    item_ref_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_category VARCHAR(255) NOT NULL,
    score NUMERIC NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL,
    UNIQUE(outlet_id,item_ref_id)
);

-- Down Migration
DROP TABLE IF EXISTS outlet_item_scores;
DROP TABLE IF EXISTS order_lines;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS outlets;
DROP TABLE IF EXISTS brands;
