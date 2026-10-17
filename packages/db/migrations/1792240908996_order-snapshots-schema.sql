-- Up Migration
CREATE TABLE order_snapshots (
    outlet_id uuid NOT NULL REFERENCES outlets(id),
    order_date date NOT NULL,
    object_key text NOT NULL,
    sha256 text NOT NULL,
    byte_size int NOT NULL,
    order_count int NOT NULL,
    line_count int NOT NULL,
    fetched_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_snapshots_pkey PRIMARY KEY (outlet_id, order_date),
    CONSTRAINT order_snapshots_sha256_check
        CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT order_snapshots_byte_size_check
        CHECK (byte_size >= 0),
    CONSTRAINT order_snapshots_order_count_check
        CHECK (order_count >= 0),
    CONSTRAINT order_snapshots_line_count_check
        CHECK (line_count >= 0)
);

-- Down Migration
DROP TABLE order_snapshots;