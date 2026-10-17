-- Up Migration
CREATE TABLE brand_data_sources (
    brand_id uuid PRIMARY KEY REFERENCES brands(id),
    url text NOT NULL,
    auth_secret_ref text,
    timeout_ms int NOT NULL DEFAULT 30000,
    refetch_days int NOT NULL DEFAULT 3,
    max_chunk_days int NOT NULL DEFAULT 7,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT brand_data_sources_timeout_ms_check 
        CHECK (timeout_ms BETWEEN 1000 AND 120000),
    CONSTRAINT brand_data_sources_refetch_days_check
        CHECK (refetch_days >= 0),
    CONSTRAINT brand_data_sources_max_chunk_days_check
        CHECK (max_chunk_days BETWEEN 1 AND 92),
    CONSTRAINT brand_data_sources_auth_secret_ref_check
        CHECK (auth_secret_ref ~ '^[A-Z][A-Z0-9_]*$')
);

-- Down Migration
DROP TABLE brand_data_sources;