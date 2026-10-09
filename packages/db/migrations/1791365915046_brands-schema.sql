-- Up Migration
CREATE TABLE brands (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    external_id         text NOT NULL,
    name                text NOT NULL,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT brands_tenant_external_id_key UNIQUE (tenant_id, external_id)
);

CREATE UNIQUE INDEX brands_tenant_name_key ON brands (tenant_id, lower(name));

-- Down Migration
DROP TABLE brands;
