-- Up Migration
ALTER TABLE user_identities DROP CONSTRAINT user_identities_provider_check;
ALTER TABLE user_identities
    ADD CONSTRAINT user_identities_provider_check CHECK (provider IN ('google', 'microsoft'));

-- Every session before this migration was a Google sign-in.
ALTER TABLE user_sessions ADD COLUMN provider text;
UPDATE user_sessions SET provider = 'google';
ALTER TABLE user_sessions ALTER COLUMN provider SET NOT NULL;
ALTER TABLE user_sessions
    ADD CONSTRAINT user_sessions_provider_check CHECK (provider IN ('google', 'microsoft'));

-- Down Migration
ALTER TABLE user_sessions DROP COLUMN provider;

-- Fails while any Microsoft identity exists.
ALTER TABLE user_identities DROP CONSTRAINT user_identities_provider_check;
ALTER TABLE user_identities
    ADD CONSTRAINT user_identities_provider_check CHECK (provider IN ('google'));
