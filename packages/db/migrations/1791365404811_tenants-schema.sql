-- Up Migration
CREATE TABLE tenants (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id         text NOT NULL,
    name                text NOT NULL,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenants_external_id_key UNIQUE (external_id)
);

CREATE UNIQUE INDEX tenants_name_key ON tenants (lower(name));

-- Down Migration
DROP TABLE tenants;
