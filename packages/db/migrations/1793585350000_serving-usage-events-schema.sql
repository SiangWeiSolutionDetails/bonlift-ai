-- Up Migration
-- One row per authenticated /v1 call, written after the reply is sent. Calls without a valid key are not
-- attributable to a brand, so they are not usage. Request bodies are not kept (customer ids, size).
CREATE TABLE serving_usage_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_id uuid NOT NULL REFERENCES brands(id),
    -- SET NULL: deleting a revoked key keeps its calls in the brand's totals, without the key's name.
    api_key_id uuid REFERENCES brand_api_keys(id) ON DELETE SET NULL,
    route text NOT NULL,
    status_code smallint NOT NULL,
    duration_ms int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT serving_usage_events_status_code_check CHECK (status_code BETWEEN 100 AND 599),
    CONSTRAINT serving_usage_events_duration_ms_check CHECK (duration_ms >= 0)
);

CREATE INDEX serving_usage_events_brand_created_idx ON serving_usage_events (brand_id, created_at);
-- Backs ON DELETE SET NULL, which would otherwise scan the whole table for each deleted key.
CREATE INDEX serving_usage_events_api_key_id_idx ON serving_usage_events (api_key_id);

-- Down Migration
DROP TABLE serving_usage_events;
