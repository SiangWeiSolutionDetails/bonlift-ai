-- Up Migration
CREATE TABLE customer_item_scores (
    run_id uuid NOT NULL REFERENCES computation_runs(id),
    run_date date NOT NULL,
    brand_id uuid NOT NULL,
    customer_external_id text NOT NULL,
    external_item_id text NOT NULL,
    score numeric NOT NULL,
    n_orders int NOT NULL,
    rank int NOT NULL,
    CONSTRAINT customer_item_scores_score_check
        CHECK (score >= 0 AND score <= 1),
    CONSTRAINT customer_item_scores_n_orders_check
        CHECK (n_orders >= 1),
    CONSTRAINT customer_item_scores_rank_check
        CHECK (rank >= 1),
    PRIMARY KEY (run_id, customer_external_id, external_item_id)
);

-- Down Migration
DROP TABLE customer_item_scores;
