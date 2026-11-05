-- Up Migration
ALTER TABLE brands ADD COLUMN deleted_at timestamptz;

-- A deleted brand's name is free to reuse within its tenant.
DROP INDEX brands_tenant_name_key;
CREATE UNIQUE INDEX brands_tenant_name_key ON brands (tenant_id, lower(name)) WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX brands_tenant_name_key;
CREATE UNIQUE INDEX brands_tenant_name_key ON brands (tenant_id, lower(name));
ALTER TABLE brands DROP COLUMN deleted_at;
