-- Up Migration
-- Soft-deleted brands keep their rows; the permission check treats a deleted brand as not found.
CREATE TABLE user_brand_roles (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id uuid NOT NULL REFERENCES brands(id),
    role_id uuid NOT NULL,
    role_kind text NOT NULL DEFAULT 'brand',
    granted_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_brand_roles_pkey PRIMARY KEY (user_id, brand_id),
    CONSTRAINT user_brand_roles_role_kind_check CHECK (role_kind = 'brand'),
    CONSTRAINT user_brand_roles_role_fkey FOREIGN KEY (role_id, role_kind) REFERENCES roles (id, kind)
);

CREATE INDEX user_brand_roles_brand_id_idx ON user_brand_roles (brand_id);
CREATE INDEX user_brand_roles_role_id_idx ON user_brand_roles (role_id);

-- Down Migration
DROP TABLE user_brand_roles;
