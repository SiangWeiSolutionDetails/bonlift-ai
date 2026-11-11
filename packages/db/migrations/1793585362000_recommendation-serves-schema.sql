-- Up Migration
-- One row per /v1/recommendations response that returned items, written after the reply is sent. The id is the
-- recommendationId sent to the caller, who quotes it with feedback. Kept forever for reports, so no customer id or
-- hash is stored: is_identified only says whether one was sent.
-- An item is ignored when it is in neither feedback array once the feedback window has passed; that is never stored.
CREATE TABLE recommendation_serves (
    id uuid PRIMARY KEY,
    brand_id uuid NOT NULL REFERENCES brands(id),
    -- No ON DELETE action and no index: channels are never deleted, and serves are read by brand and time.
    channel_id uuid REFERENCES channels(id),
    outlet_id uuid NOT NULL REFERENCES outlets(id),
    is_identified boolean NOT NULL,
    daypart text NOT NULL,
    -- No foreign keys: retention deletes old runs, and their serves stay.
    run_id uuid,
    customer_run_id uuid,
    affinity_run_id uuid,
    -- Served items in rank order; reasons[i] is the reason of item_ids[i].
    item_ids text[] NOT NULL,
    reasons text[] NOT NULL,
    accepted_item_ids text[] NOT NULL DEFAULT '{}',
    rejected_item_ids text[] NOT NULL DEFAULT '{}',
    served_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recommendation_serves_item_ids_check CHECK (cardinality(item_ids) >= 1),
    CONSTRAINT recommendation_serves_reasons_check CHECK (cardinality(reasons) = cardinality(item_ids))
);

CREATE INDEX recommendation_serves_brand_served_idx ON recommendation_serves (brand_id, served_at);

-- Down Migration
DROP TABLE recommendation_serves;
