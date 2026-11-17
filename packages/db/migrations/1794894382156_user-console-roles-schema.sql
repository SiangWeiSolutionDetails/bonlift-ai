-- Up Migration
-- The primary key allows one console role per user; the composite key makes a brand role impossible to store here.
CREATE TABLE user_console_roles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role_id uuid NOT NULL,
    role_kind text NOT NULL DEFAULT 'console',
    granted_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_console_roles_role_kind_check CHECK (role_kind = 'console'),
    CONSTRAINT user_console_roles_role_fkey FOREIGN KEY (role_id, role_kind) REFERENCES roles (id, kind)
);

CREATE INDEX user_console_roles_role_id_idx ON user_console_roles (role_id);

-- Down Migration
DROP TABLE user_console_roles;
