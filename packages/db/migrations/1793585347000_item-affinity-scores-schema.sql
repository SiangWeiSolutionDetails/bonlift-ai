-- Up Migration
CREATE TABLE item_affinity_scores (
    run_id uuid NOT NULL REFERENCES computation_runs(id),
    run_date date NOT NULL,
    brand_id uuid NOT NULL,
    item_a text NOT NULL,
    item_a_name text,
    item_b text NOT NULL,
    item_b_name text,
    n_pair int NOT NULL,
    n_item_a int NOT NULL,
    confidence numeric NOT NULL,
    lift numeric NOT NULL,
    rank int NOT NULL,
    CONSTRAINT item_affinity_scores_n_pair_check
        CHECK (n_pair >= 1),
    CONSTRAINT item_affinity_scores_n_item_a_check
        CHECK (n_item_a >= 1),
    CONSTRAINT item_affinity_scores_confidence_check
        CHECK (confidence > 0 AND confidence <= 1),
    CONSTRAINT item_affinity_scores_lift_check
        CHECK (lift > 0),
    CONSTRAINT item_affinity_scores_rank_check
        CHECK (rank >= 1),
    PRIMARY KEY (run_id, item_a, item_b)
);

-- Down Migration
DROP TABLE item_affinity_scores;
