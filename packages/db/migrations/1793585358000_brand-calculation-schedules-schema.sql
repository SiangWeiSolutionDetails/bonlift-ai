-- Up Migration
-- One nightly schedule per brand. Not versioned like the calculation configs: it only decides when runs start, and
-- each run already records its own window. The last_* columns are written by the worker after each scheduled run.
CREATE TABLE brand_calculation_schedules (
    brand_id uuid PRIMARY KEY REFERENCES brands(id),
    is_enabled boolean NOT NULL DEFAULT true,
    run_time time NOT NULL DEFAULT '03:00',
    time_zone text NOT NULL DEFAULT 'Asia/Singapore',
    outlet_window_days int NOT NULL DEFAULT 28,
    customer_window_days int NOT NULL DEFAULT 90,
    affinity_window_days int NOT NULL DEFAULT 90,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_run_at timestamptz,
    last_queued int,
    last_failed_to_queue int,
    last_error text,
    CONSTRAINT brand_calculation_schedules_outlet_window_days_check
        CHECK (outlet_window_days BETWEEN 1 AND 366),
    CONSTRAINT brand_calculation_schedules_customer_window_days_check
        CHECK (customer_window_days BETWEEN 1 AND 366),
    CONSTRAINT brand_calculation_schedules_affinity_window_days_check
        CHECK (affinity_window_days BETWEEN 1 AND 366)
);

-- Every brand, soft-deleted ones included: like brand_data_sources, the row always exists for a brand, so no read
-- has to handle a missing one. Deleted brands are filtered out where schedules are read.
INSERT INTO brand_calculation_schedules (brand_id)
SELECT id FROM brands;

-- Down Migration
DROP TABLE brand_calculation_schedules;
