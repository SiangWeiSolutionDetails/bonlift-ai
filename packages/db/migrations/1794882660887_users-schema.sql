-- Up Migration
-- Users are disabled, never deleted. Emails are stored lowercase, so the UNIQUE constraint is the lookup index.
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    display_name text,
    status text NOT NULL DEFAULT 'invited',
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_email_check CHECK (email = lower(email)),
    CONSTRAINT users_status_check CHECK (status IN ('invited', 'active', 'disabled'))
);

-- Down Migration
DROP TABLE users;
