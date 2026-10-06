import type { Pool } from "pg";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { buildAssignments } from "../utils/sql.js";
import { isUniqueViolation } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";
import {
  BrandParamsSchema,
  BrandRecordSchemaType,
  CreateBrandBodySchema,
  CreateBrandBodySchemaType,
  UpdateBrandBodySchema,
  UpdateBrandBodySchemaType,
} from "../schemas/brand.schema.js";

function mapBrandRow(row: any): BrandRecordSchemaType {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  };
}

export async function getBrand(
  pool: Pool,
  brandId: string,
): Promise<BrandRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT b.id, b.name, b.is_active 
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

export async function getBrands(pool: Pool): Promise<BrandRecordSchemaType[]> {
  const result = await pool.query(
    `SELECT b.id, b.name, b.is_active FROM brands b;`,
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
      name: data?.name,
    });

    const result = await pool.query(
      `
    INSERT INTO brands (${columns}) VALUES (${placeholders}) 
    RETURNING id, name, is_active`,
      values,
    );

    return mapBrandRow(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error) && data?.name) {
      throw new ConflictError(`Brand ${data?.name} already exists.`);
    }
    throw error;
  }
}

export async function updateBrand(
  pool: Pool,
  brandId: string,
  data: UpdateBrandBodySchemaType,
) {
  try {
    assertValid(BrandParamsSchema, { brandId });
    assertValid(UpdateBrandBodySchema, data);

    const { setClause, values, nextPlaceholder } = buildAssignments({
      name: data?.name,
      is_active: data?.isActive,
    });

    const result = await pool.query(
      `
    UPDATE brands b 
    SET ${setClause} 
    WHERE b.id = ${nextPlaceholder}
    RETURNING id, name, is_active`,
      [...values, brandId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Brand does not exist.");
    }

    return mapBrandRow(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error) && data?.name) {
      throw new ConflictError(`Brand ${data?.name} already exists.`);
    }
    throw error;
  }
}
