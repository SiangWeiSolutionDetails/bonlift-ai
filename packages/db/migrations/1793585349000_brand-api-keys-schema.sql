-- Up Migration
-- A key is "<key_prefix>.<secret>". Only the SHA-256 hash of the whole key is stored; the prefix finds the row.
CREATE TABLE brand_api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES brands(id),
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash bytea NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    CONSTRAINT brand_api_keys_name_check CHECK (name ~ '^\S(.*\S)?$'),
    CONSTRAINT brand_api_keys_key_prefix_check CHECK (key_prefix ~ '^[0-9a-f]{8}$'),
    CONSTRAINT brand_api_keys_key_hash_check CHECK (octet_length(key_hash) = 32),
    CONSTRAINT brand_api_keys_key_prefix_key UNIQUE (key_prefix)
);

-- A label names one live key per brand; revoked keys keep theirs, so a key can be replaced under the same name.
CREATE UNIQUE INDEX brand_api_keys_brand_name_key ON brand_api_keys (brand_id, lower(name)) WHERE revoked_at IS NULL;

-- Down Migration
DROP TABLE brand_api_keys;
