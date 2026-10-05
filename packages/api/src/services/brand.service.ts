import type { Pool } from "pg";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { isValidUuid } from "../utils/uuid.js";
import { buildAssignments } from "../utils/sql.js";
import { isUniqueViolation } from "../utils/pgErrors.js";

export interface BrandRecord {
  id: string;
  name: string;
  isActive: boolean;
}

function mapBrandRow(row: any): BrandRecord {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  };
}

export async function getBrands(
  pool: Pool,
  options?: { includeInactive?: boolean },
): Promise<BrandRecord[]> {
  const includeInactive = options?.includeInactive;

  const result = await pool.query(`
    SELECT b.id, b.name, b.is_active
    FROM brands b
    ${!includeInactive ? "WHERE b.is_active IS TRUE" : ""};`);

  return result.rows.map(mapBrandRow);
}

export async function getBrand(
  pool: Pool,
  brandId: string,
  options?: { includeInactive?: boolean },
): Promise<BrandRecord> {
  if (!isValidUuid(brandId)) {
    throw new ValidationError("Brand id must be a valid UUID.");
  }

  const includeInactive = options?.includeInactive;

  const result = await pool.query(
    `
    SELECT b.id, b.name, b.is_active 
    FROM brands b 
    WHERE b.id = $1
    ${!includeInactive ? "AND b.is_active IS TRUE" : ""} 
    LIMIT 1;`,
    [brandId],
  );

  if (result.rows.length <= 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return mapBrandRow(result.rows[0]);
}

export async function createBrand(
  pool: Pool,
  data: {
    name: string;
  },
): Promise<BrandRecord> {
  const { name } = data;

  if (!name) {
    throw new ValidationError("Name is required.");
  }

  try {
    const { columns, placeholders, values } = buildAssignments({ name });

    const result = await pool.query(
      `
    INSERT INTO brands (${columns}) VALUES (${placeholders}) 
    RETURNING id, name, is_active`,
      values,
    );

    return mapBrandRow(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`Brand ${name} already exists.`);
    }
    throw error;
  }
}

export async function updateBrand(
  pool: Pool,
  brandId: string,
  data: {
    name?: string;
    isActive?: boolean;
  },
) {
  const { name, isActive } = data;

  if (!name && isActive !== true && isActive !== false) {
    throw new ValidationError("Missing required parameters.")
  }

  await getBrand(pool, brandId, { includeInactive: true });

  try {
    const { setClause, values, nextPlaceholder } = buildAssignments({
      name: name,
      is_active: isActive,
    });

    const result = await pool.query(
      `
    UPDATE brands b 
    SET ${setClause} 
    WHERE b.id = ${nextPlaceholder}
    RETURNING id, name, is_active`,
      [...values, brandId],
    );

    return mapBrandRow(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`Brand ${name} already exists.`);
    }
    throw error;
  }
}
