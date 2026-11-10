-- Up Migration
-- The ordering channels shared by every brand. The list only changes through migrations, so a code is never
-- renamed: keys and usage history keep pointing at the same channel.
CREATE TABLE channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT channels_code_check CHECK (code ~ '^[a-z][a-z0-9_-]{0,31}$'),
    CONSTRAINT channels_name_check CHECK (name ~ '^\S(.*\S)?$'),
    CONSTRAINT channels_code_key UNIQUE (code)
);

INSERT INTO channels (code, name)
VALUES ('tqr', 'TQR'), ('sok', 'SOK'), ('pos', 'POS');

-- Each channel as switched on or off for one brand. Every brand has a row for every channel, off until an admin
-- switches it on: createBrand inserts them, and a migration that adds a channel must insert its row for every brand.
CREATE TABLE brand_channels (
    brand_id uuid NOT NULL REFERENCES brands(id),
    channel_id uuid NOT NULL REFERENCES channels(id),
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_id, channel_id)
);

-- Deleted brands get rows too, like brand_calculation_schedules: their keys and usage history keep a valid target.
INSERT INTO brand_channels (brand_id, channel_id)
SELECT b.id, c.id
FROM brands b
CROSS JOIN channels c;

-- NULL for keys created before channels existed: they keep serving without channel checks.
-- The composite key makes a key pointing at a channel not mapped to its own brand impossible, not just unchecked.
ALTER TABLE brand_api_keys
    ADD COLUMN channel_id uuid,
    ADD CONSTRAINT brand_api_keys_channel_fkey
        FOREIGN KEY (brand_id, channel_id) REFERENCES brand_channels (brand_id, channel_id);

-- No ON DELETE action and no index: channels are never deleted, and usage is read by brand and time.
ALTER TABLE serving_usage_events
    ADD COLUMN channel_id uuid REFERENCES channels(id);

-- Down Migration
ALTER TABLE serving_usage_events
    DROP COLUMN channel_id;

ALTER TABLE brand_api_keys
    DROP COLUMN channel_id;

DROP TABLE brand_channels;

DROP TABLE channels;
