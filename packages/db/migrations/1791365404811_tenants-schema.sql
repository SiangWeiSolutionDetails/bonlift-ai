-- Up Migration
CREATE TABLE tenants (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    -- No leading/trailing whitespace; mirrors NAME_PATTERN in @ai-services/contracts.
    CONSTRAINT tenants_name_check CHECK (name ~ '^\S(.*\S)?$')
);

CREATE UNIQUE INDEX tenants_name_key ON tenants (lower(name));

-- Down Migration
DROP TABLE tenants;
