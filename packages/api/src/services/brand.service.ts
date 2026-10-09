import type { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { buildAssignments } from "../utils/sql.js";
import {
  isExternalIdViolation,
  isForeignKeyViolation,
  isUniqueViolation,
} from "../utils/pgErrors.js";
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
} from "../schemas/brand.schema.js";

const BRAND_COLUMNS = "id, tenant_id, external_id, name, is_active";

function mapBrandRow(row: any): BrandRecordSchemaType {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    externalId: row.external_id,
    name: row.name,
    isActive: row.is_active,
  };
}

function toConflictError(
  error: unknown,
  data: { externalId?: string; name?: string },
) {
  if (isExternalIdViolation(error)) {
    return new ConflictError(
      `Brand with external id ${data.externalId} already exists for this tenant.`,
    );
  }
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

  const conditions = [];
  const values = [];

  if (tenantId) {
    conditions.push("b.tenant_id = $1");
    values.push(tenantId);
  }

  const result = await pool.query(
    `
    SELECT ${BRAND_COLUMNS}
    FROM brands b
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
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

    const { columns, placeholders, values } = buildAssignments({
      tenant_id: data.tenantId,
      external_id: data.externalId,
      name: data.name,
    });

    const result = await pool.query(
      `
    INSERT INTO brands (${columns}) VALUES (${placeholders})
    RETURNING ${BRAND_COLUMNS}`,
      values,
    );

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
