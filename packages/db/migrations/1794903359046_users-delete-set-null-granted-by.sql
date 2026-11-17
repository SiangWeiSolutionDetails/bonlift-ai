-- Up Migration
-- A deleted user's grants stay; only the record of who granted them is cleared.
ALTER TABLE user_console_roles
    DROP CONSTRAINT user_console_roles_granted_by_fkey,
    ADD CONSTRAINT user_console_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE user_brand_roles
    DROP CONSTRAINT user_brand_roles_granted_by_fkey,
    ADD CONSTRAINT user_brand_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;

-- Down Migration
ALTER TABLE user_brand_roles
    DROP CONSTRAINT user_brand_roles_granted_by_fkey,
    ADD CONSTRAINT user_brand_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id);

ALTER TABLE user_console_roles
    DROP CONSTRAINT user_console_roles_granted_by_fkey,
    ADD CONSTRAINT user_console_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id);
