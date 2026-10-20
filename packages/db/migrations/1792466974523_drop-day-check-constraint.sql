-- Up Migration
ALTER TABLE brand_data_sources
    DROP CONSTRAINT brand_data_sources_refetch_days_check,
    DROP CONSTRAINT brand_data_sources_max_chunk_days_check,
    ADD CONSTRAINT brand_data_sources_refetch_days_check CHECK (refetch_days >= 0),
    ADD CONSTRAINT brand_data_sources_max_chunk_days_check CHECK (max_chunk_days >= 1);

-- Down Migration
ALTER TABLE brand_data_sources
    DROP CONSTRAINT brand_data_sources_refetch_days_check,
    DROP CONSTRAINT brand_data_sources_max_chunk_days_check,
    ADD CONSTRAINT brand_data_sources_refetch_days_check CHECK (refetch_days BETWEEN 0 AND 92),
    ADD CONSTRAINT brand_data_sources_max_chunk_days_check CHECK (max_chunk_days BETWEEN 1 AND 92);
