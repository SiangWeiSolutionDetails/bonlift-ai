import type { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { buildAssignments } from "../utils/sql.js";
import { isForeignKeyViolation, isUniqueViolation } from "../utils/pgErrors.js";
import { withTransaction } from "../utils/transaction.js";
import { assertValid } from "../utils/validate.js";
import {
  BrandParamsSchema,
  BrandQuerySchema,
  BrandQuerySchemaType,
  BrandRecordSchemaType,
  CreateBrandBodySchema,
  CreateBrandBodySchemaType,
  UpdateBrandBodySchema,
  UpdateBrandBodySchemaType,
} from "@bonlift-ai/contracts";

const BRAND_COLUMNS = "id, tenant_id, name, is_active";

function mapBrandRow(row: any): BrandRecordSchemaType {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    isActive: row.is_active,
  };
}

function toConflictError(error: unknown, data: { name?: string }) {
  if (isUniqueViolation(error)) {
    return new ConflictError(
      `Brand ${data.name} already exists for this tenant.`,
    );
  }
  return null;
}

export async function getBrand(
  pool: Pool,
  brandId: string,
): Promise<BrandRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT ${BRAND_COLUMNS}
    FROM brands b
    WHERE b.id = $1
      AND b.deleted_at IS NULL
    LIMIT 1;`,
    [brandId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return mapBrandRow(result.rows[0]);
}

export async function getBrands(
  pool: Pool,
  options: BrandQuerySchemaType = {},
): Promise<BrandRecordSchemaType[]> {
  const tenantId = options?.tenantId;

  assertValid(BrandQuerySchema, { tenantId });

  const conditions = ["b.deleted_at IS NULL"];
  const values = [];

  if (tenantId) {
    values.push(tenantId);
    conditions.push(`b.tenant_id = $${values.length}`);
  }

  const result = await pool.query(
    `
    SELECT ${BRAND_COLUMNS}
    FROM brands b
    WHERE ${conditions.join(" AND ")}
    ORDER BY b.name, b.id;`,
    values,
  );

  return result.rows.map(mapBrandRow);
}

export async function createBrand(
  pool: Pool,
  data: CreateBrandBodySchemaType,
): Promise<BrandRecordSchemaType> {
  try {
    assertValid(CreateBrandBodySchema, data);

    // FOR SHARE makes this wait for a tenant delete in progress, then see the tenant as deleted (no rows).
    const result = await pool.query(
      `
      WITH
      b AS (
        INSERT INTO brands (tenant_id, name)
        SELECT t.id, $2
        FROM tenants t
        WHERE t.id = $1
          AND t.deleted_at IS NULL
        FOR SHARE
        RETURNING ${BRAND_COLUMNS}
      ),
      bds AS (
        INSERT INTO brand_data_sources (brand_id)
        SELECT id FROM b
      ),
      bcs AS (
        INSERT INTO brand_calculation_schedules (brand_id)
        SELECT id FROM b
      ),
      -- Every channel, switched off until an admin switches it on.
      bch AS (
        INSERT INTO brand_channels (brand_id, channel_id)
        SELECT b.id, c.id FROM b CROSS JOIN channels c
      ),
      ccv AS (
        INSERT INTO calculation_config_versions (brand_id, job_type)
        SELECT b.id, 'outlet_item_scores' FROM b
        RETURNING id
      ),
      oisccv AS (
        INSERT INTO outlet_item_scores_calculation_config_versions (id)
        SELECT ccv.id FROM ccv
      ),
      customer_ccv AS (
        INSERT INTO calculation_config_versions (brand_id, job_type)
        SELECT b.id, 'customer_item_scores' FROM b
        RETURNING id
      ),
      cisccv AS (
        INSERT INTO customer_item_scores_calculation_config_versions (id)
        SELECT customer_ccv.id FROM customer_ccv
      ),
      affinity_ccv AS (
        INSERT INTO calculation_config_versions (brand_id, job_type)
        SELECT b.id, 'item_affinity' FROM b
        RETURNING id
      ),
      iaccv AS (
        INSERT INTO item_affinity_calculation_config_versions (id)
        SELECT affinity_ccv.id FROM affinity_ccv
      )
      SELECT ${BRAND_COLUMNS} FROM b;
      `,
      [data.tenantId, data.name],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Tenant does not exist.");
    }

    return mapBrandRow(result.rows[0]);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new NotFoundError("Tenant does not exist.");
    }
    throw toConflictError(error, data) ?? error;
  }
}

export async function updateBrand(
  pool: Pool,
  brandId: string,
  data: UpdateBrandBodySchemaType,
): Promise<BrandRecordSchemaType> {
  try {
    assertValid(BrandParamsSchema, { brandId });
    assertValid(UpdateBrandBodySchema, data);

    const { setClause, values, nextPlaceholder } = buildAssignments({
      name: data.name,
      is_active: data.isActive,
    });

    const result = await pool.query(
      `
    UPDATE brands b
    SET ${setClause}, updated_at = now()
    WHERE b.id = ${nextPlaceholder}
      AND b.deleted_at IS NULL
    RETURNING ${BRAND_COLUMNS}`,
      [...values, brandId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Brand does not exist.");
    }

    return mapBrandRow(result.rows[0]);
  } catch (error) {
    throw toConflictError(error, data) ?? error;
  }
}

// Soft delete cascading to the brand's outlets. Two statements for the same reason as deleteTenant: the outlet
// update's fresh snapshot catches an outlet whose insert held the brand's FOR SHARE lock first.
export async function deleteBrand(pool: Pool, brandId: string): Promise<void> {
  assertValid(BrandParamsSchema, { brandId });

  await withTransaction(pool, async (client) => {
    const result = await client.query(
      `
      UPDATE brands
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1
        AND deleted_at IS NULL`,
      [brandId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Brand does not exist.");
    }

    await client.query(
      `
      UPDATE outlets
      SET deleted_at = now(), updated_at = now()
      WHERE brand_id = $1
        AND deleted_at IS NULL`,
      [brandId],
    );
  });
}
