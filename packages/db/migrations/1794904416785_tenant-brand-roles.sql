-- Up Migration
-- Brand roles belong to a tenant; each tenant gets a built-in Brand Owner whose actions are stored rows, unlike Admin.
ALTER TABLE roles ADD COLUMN tenant_id uuid REFERENCES tenants(id);
ALTER TABLE user_brand_roles ADD COLUMN tenant_id uuid;

-- Dropped before the per-tenant copies, which share names across tenants.
DROP INDEX roles_kind_name_key;

UPDATE user_brand_roles ubr
SET tenant_id = b.tenant_id
FROM brands b
WHERE b.id = ubr.brand_id;

-- Soft-deleted tenants included: their assignments must satisfy the new foreign keys too.
INSERT INTO roles (name, kind, is_builtin, tenant_id)
SELECT 'Brand Owner', 'brand', true, t.id
FROM tenants t;

INSERT INTO role_permissions (role_id, action)
SELECT r.id, a.action
FROM roles r
CROSS JOIN (VALUES
    ('outlets.view'),
    ('outlets.create'),
    ('outlets.edit'),
    ('outlets.delete'),
    ('dataSource.view'),
    ('dataSource.edit'),
    ('snapshots.view'),
    ('snapshots.viewCustomerIds'),
    ('snapshots.upload'),
    ('calculations.view'),
    ('calculations.trigger'),
    ('calculations.editSchedule'),
    ('calculations.publish'),
    ('configs.view'),
    ('configs.edit'),
    ('results.view'),
    ('customerScores.view'),
    ('itemAffinity.view'),
    ('channels.view'),
    ('channels.edit'),
    ('apiKeys.view'),
    ('apiKeys.create'),
    ('apiKeys.revoke'),
    ('apiKeys.delete'),
    ('usage.view'),
    ('feedback.view'),
    ('members.view'),
    ('members.manage'),
    ('brandRoles.view'),
    ('brandRoles.manage')
) AS a(action)
WHERE r.kind = 'brand' AND r.is_builtin AND r.tenant_id IS NOT NULL;

-- One row per (tenant, global role in use there). The seeded Brand Owner, unedited (exactly its 28 seeded actions),
-- maps onto the tenant's built-in; edited, it is copied as "Brand Owner (custom)". Every other role is copied as is.
CREATE TEMP TABLE brand_role_map ON COMMIT DROP AS
WITH used AS (
    SELECT DISTINCT ubr.tenant_id, ubr.role_id
    FROM user_brand_roles ubr
),
seeded AS (
    SELECT r.id,
           ARRAY(SELECT rp.action FROM role_permissions rp WHERE rp.role_id = r.id ORDER BY rp.action)
           = ARRAY(SELECT s.action FROM unnest(ARRAY[
               'outlets.view', 'outlets.create', 'outlets.edit', 'outlets.delete',
               'dataSource.view', 'dataSource.edit',
               'snapshots.view', 'snapshots.viewCustomerIds', 'snapshots.upload',
               'calculations.view', 'calculations.trigger', 'calculations.editSchedule', 'calculations.publish',
               'configs.view', 'configs.edit',
               'results.view', 'customerScores.view', 'itemAffinity.view',
               'channels.view', 'channels.edit',
               'apiKeys.view', 'apiKeys.create', 'apiKeys.revoke', 'apiKeys.delete',
               'usage.view', 'feedback.view',
               'members.view', 'members.manage'
           ]) AS s(action) ORDER BY s.action) AS unedited
    FROM roles r
    WHERE r.kind = 'brand' AND r.tenant_id IS NULL AND lower(r.name) = 'brand owner'
)
SELECT
    u.tenant_id,
    u.role_id AS old_role_id,
    COALESCE(s.unedited, false) AS to_builtin,
    CASE WHEN s.unedited THEN owner.id ELSE gen_random_uuid() END AS new_role_id,
    CASE WHEN s.id IS NOT NULL THEN 'Brand Owner (custom)' ELSE r.name END AS new_name,
    r.created_at,
    r.updated_at
FROM used u
JOIN roles r ON r.id = u.role_id
LEFT JOIN seeded s ON s.id = u.role_id
JOIN roles owner ON owner.tenant_id = u.tenant_id AND owner.kind = 'brand' AND owner.is_builtin;

INSERT INTO roles (id, name, kind, tenant_id, created_at, updated_at)
SELECT m.new_role_id, m.new_name, 'brand', m.tenant_id, m.created_at, m.updated_at
FROM brand_role_map m
WHERE NOT m.to_builtin;

INSERT INTO role_permissions (role_id, action)
SELECT m.new_role_id, rp.action
FROM brand_role_map m
JOIN role_permissions rp ON rp.role_id = m.old_role_id
WHERE NOT m.to_builtin;

UPDATE user_brand_roles ubr
SET role_id = m.new_role_id
FROM brand_role_map m
WHERE m.tenant_id = ubr.tenant_id
  AND m.old_role_id = ubr.role_id;

-- Now unassigned; their role_permissions rows cascade.
DELETE FROM roles
WHERE kind = 'brand' AND tenant_id IS NULL;

ALTER TABLE roles
    ADD CONSTRAINT roles_tenant_id_check CHECK ((kind = 'console') = (tenant_id IS NULL)),
    -- Target of the brand-assignment foreign key; roles_id_kind_key stays for console assignments.
    ADD CONSTRAINT roles_id_kind_tenant_id_key UNIQUE (id, kind, tenant_id);

CREATE UNIQUE INDEX roles_console_name_key ON roles (lower(name)) WHERE kind = 'console';
CREATE UNIQUE INDEX roles_brand_tenant_name_key ON roles (tenant_id, lower(name)) WHERE kind = 'brand';

-- Together the two composite keys make it impossible to assign one tenant's role on another tenant's brand.
ALTER TABLE user_brand_roles
    ALTER COLUMN tenant_id SET NOT NULL,
    DROP CONSTRAINT user_brand_roles_role_fkey,
    ADD CONSTRAINT user_brand_roles_tenant_brand_fkey FOREIGN KEY (tenant_id, brand_id) REFERENCES brands (tenant_id, id),
    ADD CONSTRAINT user_brand_roles_role_fkey FOREIGN KEY (role_id, role_kind, tenant_id) REFERENCES roles (id, kind, tenant_id);

-- Down Migration
DO $$
BEGIN
    RAISE EXCEPTION 'tenant-brand-roles cannot be reversed: tenant copies of brand roles cannot be merged back safely. Restore the backup taken before this migration.';
END $$;
