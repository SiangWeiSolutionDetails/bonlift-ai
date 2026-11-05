-- Up Migration
-- The check is dropped first: a 1-day run [d, d+1) becomes [d, d] and would fail the old from < to mid-update.
ALTER TABLE computation_runs DROP CONSTRAINT computation_runs_window_check;
UPDATE computation_runs SET input_window_to = input_window_to - 1;
ALTER TABLE computation_runs ADD CONSTRAINT computation_runs_window_check
    CHECK (input_window_from <= input_window_to);

-- Down Migration
ALTER TABLE computation_runs DROP CONSTRAINT computation_runs_window_check;
UPDATE computation_runs SET input_window_to = input_window_to + 1;
ALTER TABLE computation_runs ADD CONSTRAINT computation_runs_window_check
    CHECK (input_window_from < input_window_to);
