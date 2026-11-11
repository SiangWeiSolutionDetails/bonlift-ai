-- Up Migration
CREATE TABLE serving_config_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES brands (id),
    version int NOT NULL DEFAULT 1,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    min_favourite_orders int NOT NULL DEFAULT 1,
    min_pair_sample int NOT NULL DEFAULT 50,
    strong_pairing_lift numeric(6, 2) NOT NULL DEFAULT 2,
    best_seller_max_rank int NOT NULL DEFAULT 3,
    best_seller_min_list_size int NOT NULL DEFAULT 10,
    CONSTRAINT serving_config_versions_version_check
        CHECK (version >= 1),
    CONSTRAINT serving_config_versions_min_favourite_orders_check
        CHECK (min_favourite_orders >= 1),
    CONSTRAINT serving_config_versions_min_pair_sample_check
        CHECK (min_pair_sample >= 1),
    CONSTRAINT serving_config_versions_strong_pairing_lift_check
        CHECK (strong_pairing_lift >= 1),
    CONSTRAINT serving_config_versions_best_seller_max_rank_check
        CHECK (best_seller_max_rank >= 1),
    CONSTRAINT serving_config_versions_best_seller_min_list_size_check
        CHECK (best_seller_min_list_size >= 1),
    CONSTRAINT serving_config_versions_brand_version_key
        UNIQUE (brand_id, version)
);

INSERT INTO serving_config_versions (
    brand_id
)
SELECT
    b.id
FROM brands b;

-- Down Migration
DROP TABLE serving_config_versions;
