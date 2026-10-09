-- Up Migration
CREATE TABLE outlets (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          uuid NOT NULL REFERENCES brands(id),
    external_id       text NOT NULL,
    name              text NOT NULL,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT outlets_brand_external_id_key UNIQUE (brand_id, external_id)
);

CREATE UNIQUE INDEX outlets_brand_name_key ON outlets (brand_id, lower(name));

-- Down Migration
DROP TABLE outlets;
