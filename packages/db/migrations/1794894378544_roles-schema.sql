-- Up Migration
-- Admin is the built-in console role: it has no role_permissions rows, code treats it as holding every console action.
CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    kind text NOT NULL,
    is_builtin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT roles_name_check CHECK (name ~ '^\S(.*\S)?$'),
    CONSTRAINT roles_kind_check CHECK (kind IN ('console', 'brand')),
    -- Target of the composite foreign keys on the assignment tables.
    CONSTRAINT roles_id_kind_key UNIQUE (id, kind)
);

CREATE UNIQUE INDEX roles_kind_name_key ON roles (kind, lower(name));

INSERT INTO roles (name, kind, is_builtin) VALUES ('Admin', 'console', true);

-- Down Migration
DROP TABLE roles;
