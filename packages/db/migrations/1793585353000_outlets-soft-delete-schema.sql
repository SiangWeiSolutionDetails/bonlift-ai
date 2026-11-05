-- Up Migration
ALTER TABLE outlets ADD COLUMN deleted_at timestamptz;

-- A deleted outlet's name is free to reuse within its brand. Also serves the brand delete's cascade lookup.
DROP INDEX outlets_brand_name_key;
CREATE UNIQUE INDEX outlets_brand_name_key ON outlets (brand_id, lower(name)) WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX outlets_brand_name_key;
CREATE UNIQUE INDEX outlets_brand_name_key ON outlets (brand_id, lower(name));
ALTER TABLE outlets DROP COLUMN deleted_at;
