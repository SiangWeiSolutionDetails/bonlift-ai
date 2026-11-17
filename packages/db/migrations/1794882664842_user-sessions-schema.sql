-- Up Migration
-- The cookie holds 32 random bytes; only their SHA-256 is stored, so a leaked database holds no working session.
CREATE TABLE user_sessions (
    id_hash bytea PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    user_agent text,
    CONSTRAINT user_sessions_id_hash_check CHECK (octet_length(id_hash) = 32)
);

CREATE INDEX user_sessions_user_id_idx ON user_sessions (user_id);
CREATE INDEX user_sessions_expires_at_idx ON user_sessions (expires_at);

-- Down Migration
DROP TABLE user_sessions;
