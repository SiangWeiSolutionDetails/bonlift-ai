-- Up Migration
CREATE TABLE brands (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    name                text NOT NULL,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    -- Target of the outlets (tenant_id, brand_id) composite FK; also serves "brands of a tenant".
    CONSTRAINT brands_tenant_id_id_key UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX brands_tenant_name_key ON brands (tenant_id, lower(name));

-- Down Migration
DROP TABLE brands;
