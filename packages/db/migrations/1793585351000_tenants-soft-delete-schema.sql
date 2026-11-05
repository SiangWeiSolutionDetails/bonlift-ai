-- Up Migration
ALTER TABLE tenants ADD COLUMN deleted_at timestamptz;

-- A deleted tenant's name is free to reuse.
DROP INDEX tenants_name_key;
CREATE UNIQUE INDEX tenants_name_key ON tenants (lower(name)) WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX tenants_name_key;
CREATE UNIQUE INDEX tenants_name_key ON tenants (lower(name));
ALTER TABLE tenants DROP COLUMN deleted_at;
