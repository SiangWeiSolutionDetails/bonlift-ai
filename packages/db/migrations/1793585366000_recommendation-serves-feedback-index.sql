-- Up Migration
-- Most serves never get feedback, so the admin log of serves with feedback reads this small index instead of
-- walking every serve. The predicate must match the log query's text for the planner to use it.
CREATE INDEX recommendation_serves_feedback_idx
    ON recommendation_serves (brand_id, served_at, id)
    WHERE accepted_item_ids <> '{}' OR rejected_item_ids <> '{}';

-- Down Migration
DROP INDEX recommendation_serves_feedback_idx;
