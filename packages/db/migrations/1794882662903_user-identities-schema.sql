-- Up Migration
-- The primary key is the lookup on each sign-in; UNIQUE (user_id, provider) also serves "identities of a user".
CREATE TABLE user_identities (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_identities_pkey PRIMARY KEY (provider, provider_subject),
    CONSTRAINT user_identities_user_provider_key UNIQUE (user_id, provider),
    CONSTRAINT user_identities_provider_check CHECK (provider IN ('google'))
);

-- Down Migration
DROP TABLE user_identities;
