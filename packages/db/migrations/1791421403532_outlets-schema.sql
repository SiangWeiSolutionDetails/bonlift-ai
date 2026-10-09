-- Up Migration
CREATE TABLE outlets (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    brand_id          uuid NOT NULL,
    name              text NOT NULL,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT outlets_name_check CHECK (name ~ '^\S(.*\S)?$'),
    -- Guarantees an outlet's tenant always matches its brand's tenant, and blocks moving a brand
    -- to another tenant while it has outlets.
    CONSTRAINT outlets_tenant_brand_fkey
        FOREIGN KEY (tenant_id, brand_id) REFERENCES brands (tenant_id, id)
);

CREATE UNIQUE INDEX outlets_brand_name_key ON outlets (brand_id, lower(name));
CREATE INDEX outlets_tenant_id_idx ON outlets (tenant_id);

-- Down Migration
DROP TABLE outlets;
