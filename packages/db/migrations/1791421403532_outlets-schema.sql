-- Up Migration
CREATE TABLE outlets (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id),
    brand_id          uuid NOT NULL,
    external_id       text NOT NULL,
    name              text NOT NULL,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT outlets_tenant_external_id_key UNIQUE (tenant_id, external_id),
    CONSTRAINT outlets_tenant_brand_fkey FOREIGN KEY (tenant_id, brand_id) REFERENCES brands (tenant_id, id)
);

-- Also serves as the index for outlets_tenant_brand_fkey (leading columns tenant_id, brand_id).
CREATE UNIQUE INDEX outlets_tenant_brand_outlet_name_key ON outlets (tenant_id, brand_id, lower(name));

-- Down Migration
DROP TABLE outlets;
