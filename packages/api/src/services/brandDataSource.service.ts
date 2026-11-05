import {
  BrandDataSourceRecordSchemaType,
  BrandParamsSchema,
  UpdateBrandDataSourceBodySchema,
  UpdateBrandDataSourceBodySchemaType,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { NotFoundError } from "../errors.js";
import { assertValid, assertValidUrl } from "../utils/validate.js";
import { buildAssignments } from "../utils/sql.js";

const BRAND_DATA_SOURCES_COLUMNS =
  "brand_id, url, timeout_ms, refetch_days, max_chunk_days";

function mapBrandDataSourceRow(row: any): BrandDataSourceRecordSchemaType {
  return {
    brandId: row.brand_id,
    url: row.url,
    timeoutMs: row.timeout_ms,
    refetchDays: row.refetch_days,
    maxChunkDays: row.max_chunk_days,
  };
}

export async function getBrandDataSource(
  pool: Pool,
  brandId: string,
): Promise<BrandDataSourceRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT ${BRAND_DATA_SOURCES_COLUMNS}
    FROM brand_data_sources bds
    WHERE bds.brand_id = $1
      AND EXISTS (SELECT 1 FROM brands b WHERE b.id = bds.brand_id AND b.deleted_at IS NULL)
    LIMIT 1;
    `,
    [brandId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return mapBrandDataSourceRow(result.rows[0]);
}

export async function updateBrandDataSource(
  pool: Pool,
  brandId: string,
  data: UpdateBrandDataSourceBodySchemaType,
): Promise<BrandDataSourceRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(UpdateBrandDataSourceBodySchema, data);
  if (data.url !== undefined) assertValidUrl(data.url);

  const { setClause, values, nextPlaceholder } = buildAssignments({
    url: data.url,
    timeout_ms: data.timeoutMs,
    refetch_days: data.refetchDays,
    max_chunk_days: data.maxChunkDays,
  });

  const result = await pool.query(
    `
    UPDATE brand_data_sources bds
    SET ${setClause}, updated_at = now()
    WHERE bds.brand_id = ${nextPlaceholder}
      AND EXISTS (SELECT 1 FROM brands b WHERE b.id = bds.brand_id AND b.deleted_at IS NULL)
    RETURNING ${BRAND_DATA_SOURCES_COLUMNS}
    `,
    [...values, brandId],
  );

  if (result.rowCount === 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return mapBrandDataSourceRow(result.rows[0]);
}
