-- Up Migration
ALTER TABLE brands ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE outlets ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE brands ADD CONSTRAINT brands_name_key UNIQUE(name);
ALTER TABLE outlets ADD CONSTRAINT outlets_brand_id_name_key UNIQUE(brand_id,name);

-- Down Migration

ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_brand_id_name_key;
ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_name_key;

ALTER TABLE outlets DROP COLUMN IF EXISTS is_active;
ALTER TABLE brands DROP COLUMN IF EXISTS is_active;