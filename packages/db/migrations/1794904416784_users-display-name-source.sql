-- Up Migration
-- Where display_name came from: 'staff' locks it, 'provider' (Google) and NULL ask the user to confirm it once.
ALTER TABLE users
    ADD COLUMN display_name_source text,
    ADD CONSTRAINT users_display_name_source_check CHECK (display_name_source IN ('staff', 'provider', 'self'));

-- A name on a user who never signed in was typed at invite; existing active users keep theirs without the new screen.
UPDATE users
SET display_name_source = CASE WHEN last_login_at IS NULL THEN 'staff' ELSE 'self' END
WHERE display_name IS NOT NULL;

-- Down Migration
ALTER TABLE users DROP COLUMN display_name_source;
