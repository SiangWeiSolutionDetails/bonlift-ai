-- Up Migration
CREATE TABLE order_snapshots (
    outlet_id uuid NOT NULL REFERENCES outlets(id),
    order_date date NOT NULL,
    orders jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_snapshots_pkey PRIMARY KEY (outlet_id, order_date),
    CONSTRAINT order_snapshots_orders_check
        CHECK ((jsonb_typeof(orders)) = 'array')
);

-- Down Migration
DROP TABLE order_snapshots;