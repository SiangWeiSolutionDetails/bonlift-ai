-- Recommendation engine: full schema for review (PostgreSQL 13+, validated on 16)
-- Up migrations 001-005 concatenated in order. Down migrations omitted.
--
-- Context for the reviewer:
--   - Multi-brand, compute-only engine. The POS backend is the source of truth for sales and menu data.
--   - Sales and menu data are NEVER persisted here (agreed). BullMQ workers fetch pre-aggregated data from
--     POS aggregate endpoints at compute time, score in application code (per outlet / per brand / per
--     customer batch), and only the computed results and run metadata are written to this database.
--   - Item references are POS item IDs stored as opaque text (external_item_id); there is no local menu table.
--   - Hard filters (allergens, dietary, 86/availability, outlet/daypart/channel) are applied by the shared
--     ordering API (POS, TQR and kiosk all call it). This engine returns a wider ranked candidate list;
--     the caller filters, shows the top 1-3, and reports back what was filtered/shown/accepted.
--   - Customer profiles (identity, contact, consent, survey, allergies/dietary, merge) are owned by the CRM.
--     This schema stores only the CRM customer ID as an opaque customer_external_id (never the mobile number),
--     used purely as a unique identifier. Consent is read from the CRM at compute/serve time, not stored here.
--     No merge handling here: every run recomputes from POS, which must report the post-merge customer ID;
--     pre-merge IDs age out via retention. CRM customer ID must be globally unique (XB-1); to be confirmed.
--   - Tenants, brands and outlets are a small enrolment registry, created manually via the admin API (not synced).
--     Hierarchy is tenant -> brand -> outlet. A tenant is the client group that contracts with the platform
--     (e.g. Minor Food Group (Singapore) running Thai Express / Xin Wang / Poulet), never the ultimate owner,
--     which can change (e.g. Harry's: founder -> SGX-listed -> private equity) while the operations do not.
--     The tenant is the isolation and admin-scoping boundary, and the boundary for cross-brand customer data
--     (XB-*) if OQ-1 resolves to "brands under one client group".
--     Brand is still the scope for configs, runs, publishing and retention (XB-3: menus differ per brand).
--     Tenant names are unique platform-wide; brand names are unique per tenant; outlet names are unique per
--     brand (all case-insensitive).
--   - tenant_id lives on the registry (brands, outlets) and admin_audit_log only. Engine tables stay keyed by
--     brand_id and reach the tenant through brands, so a brand transfer is a registry change, not a rewrite of
--     history. outlets carries tenant_id through a composite FK to brands (tenant_id, id), so an outlet can
--     never belong to another tenant's brand, and a brand cannot be moved to another tenant while it has outlets.
--   - Computation history is append-only and kept for auditing, rollback, analysis and model training.
--   - All outlets are in Singapore; dayparts are computed in Asia/Singapore in application code.
--   - updated_at is set by application code (no trigger yet).
--
-- Retention (cost control + PDPA), configured per brand in brand_retention_policies:
--   - The retention job (role rec_retention) deletes rows older than the brand's period, in batches,
--     by (brand_id, run_date / created_at / observed_at). Rows of a currently published run are never deleted.
--   - Monthly partitions older than the platform-wide maximum retention are dropped whole.
--   - computation_runs / computation_run_scopes metadata is kept long-term for tracking.
--
-- Future POS integration (not in v1, which has no POS integration):
--   - Add external_id (POS ID mapping) to brands and outlets, plus source_updated_at / synced_at if synced.
--   - POS aggregate endpoints, filterable by outlet and date range, excluding voided/refunded lines,
--     at hourly granularity so dayparts stay defined by this engine's config:
--       - item quantity / order count per outlet per hour
--       - item-pair co-occurrence count per outlet per day
--       - item quantity / order count per customer per brand per day (post-merge customer ID)
--
-- PENDING (not yet applied below):
--   - RE-6.3 rejection semantics and suppression window (OQ-9). Implicit rejections are engine data
--     (recommendation_outcomes); explicit "never show" preferences are CRM profile data.
--   - Platform-wide min/max bounds for brand retention periods.
--   - Legal entity / operator per outlet (UEN, franchised vs company-owned) is not modelled: the engine has no
--     tax, invoicing or settlement logic. Required if the PDPA review (G-3 / OQ-10) treats franchisee outlets
--     as separate data controllers. Add as legal_entities under tenant + nullable outlets.legal_entity_id.
--   - Brand family / outlet format (e.g. Astons Specialities vs Astons Express) is not modelled. Revisit if
--     XB-4's category-level cross-brand signal needs it.
--   - Moving a brand to another tenant (acquisition) needs an explicit, audited procedure that updates the
--     brand and its outlets in one transaction; the composite FK blocks a plain UPDATE.
--   - tenant_id on engine tables + row-level security: revisit only if tenant isolation must be enforced in
--     the database rather than the API (requires per-transaction SET of the tenant on pooled connections).

-- ============================================================
-- 001_registry.sql
-- ============================================================
CREATE TABLE tenants (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    -- Registry names have no leading/trailing whitespace, so they cannot dodge the lower(name) unique indexes.
    CONSTRAINT tenants_name_check CHECK (name ~ '^\S(.*\S)?$')
);

CREATE UNIQUE INDEX tenants_name_key ON tenants (lower(name));

CREATE TABLE brands (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id),
    name              text NOT NULL,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT brands_name_check CHECK (name ~ '^\S(.*\S)?$'),
    -- Target of the outlets (tenant_id, brand_id) composite FK; also serves "brands of a tenant".
    CONSTRAINT brands_tenant_id_id_key UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX brands_tenant_name_key ON brands (tenant_id, lower(name));

-- tenant_id is copied from the brand on insert (INSERT ... SELECT FROM brands); clients never supply it.
CREATE TABLE outlets (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    brand_id          uuid NOT NULL,
    name              text NOT NULL,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT outlets_name_check CHECK (name ~ '^\S(.*\S)?$'),
    CONSTRAINT outlets_tenant_brand_fkey
        FOREIGN KEY (tenant_id, brand_id) REFERENCES brands (tenant_id, id)
);

CREATE UNIQUE INDEX outlets_brand_name_key ON outlets (brand_id, lower(name));
CREATE INDEX outlets_tenant_id_idx ON outlets (tenant_id);


-- ============================================================
-- 002_computation.sql
-- ============================================================
CREATE TABLE config_versions (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_id   uuid NOT NULL REFERENCES brands(id),
    job_type   text NOT NULL CHECK (job_type IN ('outlet_item_scores', 'item_affinity', 'customer_item_scores')),
    version    int NOT NULL,
    config     jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT config_versions_brand_job_version_key UNIQUE (brand_id, job_type, version)
);

CREATE TABLE active_configs (
    brand_id          uuid NOT NULL REFERENCES brands(id),
    job_type          text NOT NULL CHECK (job_type IN ('outlet_item_scores', 'item_affinity', 'customer_item_scores')),
    config_version_id bigint NOT NULL REFERENCES config_versions(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_id, job_type)
);

CREATE TABLE computation_runs (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_id          uuid NOT NULL REFERENCES brands(id),
    job_type          text NOT NULL CHECK (job_type IN ('outlet_item_scores', 'item_affinity', 'customer_item_scores')),
    run_date          date NOT NULL,
    algorithm_version text NOT NULL,
    config_version_id bigint NOT NULL REFERENCES config_versions(id),
    input_window_from timestamptz NOT NULL,
    input_window_to   timestamptz NOT NULL,
    trigger_type      text NOT NULL CHECK (trigger_type IN ('scheduled', 'manual', 'backfill')),
    triggered_by      text,
    queue_job_id      text,
    status            text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    row_count         int,
    error             text,
    started_at        timestamptz NOT NULL DEFAULT now(),
    finished_at       timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (input_window_from < input_window_to)
);

CREATE INDEX computation_runs_brand_job_started_idx
    ON computation_runs (brand_id, job_type, started_at DESC);

CREATE UNIQUE INDEX computation_runs_one_running_key
    ON computation_runs (brand_id, job_type)
    WHERE status = 'running';

-- One row per fan-out task of a run: an outlet, a brand-level reduce step, or a customer hash batch.
CREATE TABLE computation_run_scopes (
    run_id        bigint NOT NULL REFERENCES computation_runs(id),
    scope_level   text NOT NULL CHECK (scope_level IN ('outlet', 'brand')),
    scope_id      uuid NOT NULL,
    batch_no      smallint NOT NULL DEFAULT 0 CHECK (batch_no >= 0),
    status        text NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
    attempts      smallint NOT NULL DEFAULT 0,
    pages_fetched int NOT NULL DEFAULT 0,
    rows_fetched  int NOT NULL DEFAULT 0,
    row_count     int,
    error         text,
    started_at    timestamptz,
    finished_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, scope_level, scope_id, batch_no)
);

CREATE TABLE brand_retention_policies (
    brand_id                uuid PRIMARY KEY REFERENCES brands(id),
    results_retention_days  int NOT NULL CHECK (results_retention_days > 0),
    logs_retention_days     int NOT NULL CHECK (logs_retention_days > 0),
    updated_by              text NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE published_runs (
    brand_id   uuid NOT NULL REFERENCES brands(id),
    job_type   text NOT NULL CHECK (job_type IN ('outlet_item_scores', 'item_affinity', 'customer_item_scores')),
    run_id     bigint NOT NULL REFERENCES computation_runs(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_id, job_type)
);

-- tenant_id is NULL for platform-level actions; brand_id is NULL for platform- and tenant-level actions.
CREATE TABLE admin_audit_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id   uuid REFERENCES tenants(id),
    brand_id    uuid REFERENCES brands(id),
    actor       text NOT NULL,
    action      text NOT NULL,
    target_type text NOT NULL,
    target_id   text,
    before      jsonb,
    after       jsonb,
    reason      text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_tenant_created_idx ON admin_audit_log (tenant_id, created_at DESC);
CREATE INDEX admin_audit_log_brand_created_idx ON admin_audit_log (brand_id, created_at DESC);


-- ============================================================
-- 003_results.sql
-- ============================================================
CREATE TABLE outlet_item_scores (
    run_id           bigint NOT NULL REFERENCES computation_runs(id),
    run_date         date NOT NULL,
    brand_id         uuid NOT NULL,
    outlet_id        uuid NOT NULL,
    external_item_id text NOT NULL,
    daypart          text NOT NULL,
    score            numeric NOT NULL,
    n_orders         int NOT NULL,
    rank             smallint NOT NULL,
    PRIMARY KEY (run_id, outlet_id, daypart, external_item_id, run_date)
) PARTITION BY RANGE (run_date);

CREATE TABLE item_affinity_scores (
    run_id      bigint NOT NULL REFERENCES computation_runs(id),
    run_date    date NOT NULL,
    brand_id    uuid NOT NULL,
    scope_level text NOT NULL CHECK (scope_level IN ('outlet', 'brand')),
    scope_id    uuid NOT NULL,
    item_a      text NOT NULL,
    item_b      text NOT NULL,
    n_pair      int NOT NULL,
    confidence  numeric NOT NULL,
    lift        numeric NOT NULL,
    PRIMARY KEY (run_id, scope_level, scope_id, item_a, item_b, run_date)
) PARTITION BY RANGE (run_date);

CREATE TABLE customer_item_scores (
    run_id               bigint NOT NULL REFERENCES computation_runs(id),
    run_date             date NOT NULL,
    brand_id             uuid NOT NULL,
    customer_external_id text NOT NULL,
    external_item_id     text NOT NULL,
    score                numeric NOT NULL,
    n_orders             int NOT NULL,
    rank                 smallint NOT NULL CHECK (rank BETWEEN 1 AND 20),
    PRIMARY KEY (run_id, brand_id, customer_external_id, external_item_id, run_date)
) PARTITION BY RANGE (run_date);

CREATE INDEX outlet_item_scores_brand_run_date_idx ON outlet_item_scores (brand_id, run_date);
CREATE INDEX item_affinity_scores_brand_run_date_idx ON item_affinity_scores (brand_id, run_date);
CREATE INDEX customer_item_scores_brand_run_date_idx ON customer_item_scores (brand_id, run_date);

CREATE TABLE outlet_item_scores_2026_10 PARTITION OF outlet_item_scores
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE outlet_item_scores_2026_11 PARTITION OF outlet_item_scores
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE item_affinity_scores_2026_10 PARTITION OF item_affinity_scores
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE item_affinity_scores_2026_11 PARTITION OF item_affinity_scores
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE customer_item_scores_2026_10 PARTITION OF customer_item_scores
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE customer_item_scores_2026_11 PARTITION OF customer_item_scores
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');


-- ============================================================
-- 004_serving_logs.sql
-- ============================================================
CREATE TABLE recommendation_requests (
    rec_id             uuid NOT NULL,
    brand_id           uuid NOT NULL,
    outlet_id          uuid NOT NULL,
    customer_ref       bytea,
    customer_key_ref   text,
    channel            text NOT NULL,
    context            jsonb NOT NULL,
    computation_run_id bigint NOT NULL,
    config_version_id  bigint NOT NULL,
    feature_schema_ver int NOT NULL,
    policy             text NOT NULL CHECK (policy IN ('ranked', 'explore', 'control')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (rec_id, created_at)
) PARTITION BY RANGE (created_at);

-- filtered_stage and shown_position are reported back by the ordering API, which applies the hard filters.
CREATE TABLE recommendation_candidates (
    rec_id           uuid NOT NULL,
    brand_id         uuid NOT NULL,
    external_item_id text NOT NULL,
    features         jsonb NOT NULL,
    score            numeric,
    filtered_stage   text,
    shown_position   smallint,
    propensity       numeric,
    created_at       timestamptz NOT NULL,
    PRIMARY KEY (rec_id, external_item_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE recommendation_outcomes (
    id                   bigint GENERATED ALWAYS AS IDENTITY,
    rec_id               uuid NOT NULL,
    brand_id             uuid NOT NULL,
    customer_external_id text,
    external_item_id     text NOT NULL,
    outcome              text NOT NULL CHECK (outcome IN ('added', 'ordered', 'rejected', 'removed')),
    source               text NOT NULL,
    observed_at          timestamptz NOT NULL,
    PRIMARY KEY (id, observed_at)
) PARTITION BY RANGE (observed_at);

CREATE INDEX recommendation_outcomes_rec_id_idx ON recommendation_outcomes (rec_id, external_item_id);
CREATE INDEX recommendation_requests_brand_created_idx ON recommendation_requests (brand_id, created_at);
CREATE INDEX recommendation_candidates_brand_created_idx ON recommendation_candidates (brand_id, created_at);
CREATE INDEX recommendation_outcomes_brand_observed_idx ON recommendation_outcomes (brand_id, observed_at);
CREATE INDEX recommendation_outcomes_customer_observed_idx ON recommendation_outcomes (customer_external_id, observed_at)
    WHERE customer_external_id IS NOT NULL;

CREATE TABLE recommendation_requests_2026_10 PARTITION OF recommendation_requests
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE recommendation_requests_2026_11 PARTITION OF recommendation_requests
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE recommendation_candidates_2026_10 PARTITION OF recommendation_candidates
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE recommendation_candidates_2026_11 PARTITION OF recommendation_candidates
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE recommendation_outcomes_2026_10 PARTITION OF recommendation_outcomes
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE recommendation_outcomes_2026_11 PARTITION OF recommendation_outcomes
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');


-- ============================================================
-- 005_permissions.sql
-- ============================================================
-- Assumes roles rec_app and rec_retention already exist (created by ops; never create roles with passwords in a migration).

REVOKE UPDATE, DELETE, TRUNCATE ON
    config_versions, admin_audit_log,
    outlet_item_scores, item_affinity_scores, customer_item_scores,
    recommendation_requests, recommendation_candidates, recommendation_outcomes
FROM rec_app;

GRANT SELECT, INSERT ON
    config_versions, admin_audit_log,
    outlet_item_scores, item_affinity_scores, customer_item_scores,
    recommendation_requests, recommendation_candidates, recommendation_outcomes
TO rec_app;

GRANT SELECT, INSERT, UPDATE ON
    tenants, brands, outlets, brand_retention_policies,
    active_configs, computation_runs, computation_run_scopes, published_runs
TO rec_app;

GRANT SELECT ON brand_retention_policies, published_runs TO rec_retention;
GRANT SELECT, DELETE ON
    outlet_item_scores, item_affinity_scores, customer_item_scores,
    recommendation_requests, recommendation_candidates, recommendation_outcomes
TO rec_retention;
GRANT UPDATE (customer_ref, customer_key_ref) ON recommendation_requests TO rec_retention;
