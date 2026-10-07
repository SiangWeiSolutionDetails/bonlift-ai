import type { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { buildAssignments } from "../utils/sql.js";
import {
  CreateOutletBodySchema,
  CreateOutletBodySchemaType,
  OutletParamsSchema,
  OutletQuerySchema,
  OutletQuerySchemaType,
  OutletRecordSchemaType,
  UpdateOutletBodySchema,
  UpdateOutletBodySchemaType,
} from "../schemas/outlet.schema.js";
import { assertValid } from "../utils/validate.js";
import { isForeignKeyViolation, isUniqueViolation } from "../utils/pgErrors.js";

function mapOutletRow(row: any): OutletRecordSchemaType {
  return {
    id: row.id,
    name: row.name,
    brandId: row.brand_id,
    isActive: row.is_active,
  };
}

export async function getOutlet(pool: Pool, outletId: string) {
  assertValid(OutletParamsSchema, { outletId });

  const result = await pool.query(
    `
    SELECT o.id, o.name, o.brand_id, o.is_active
    FROM outlets o
    WHERE o.id = $1  
    LIMIT 1;
    `,
    [outletId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Outlet does not exist.");
  }

  return mapOutletRow(result.rows[0]);
}

export async function getOutlets(pool: Pool, options: OutletQuerySchemaType) {
  const brandId = options?.brandId;

  assertValid(OutletQuerySchema, { brandId });

  const conditions = [];
  const values = [];

  if (brandId) {
    conditions.push("o.brand_id = $1");
    values.push(brandId);
  }

  const result = await pool.query(
    `
    SELECT o.id, o.name, o.brand_id, o.is_active 
    FROM outlets o
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""};
    `,
    [...values],
  );

  return result.rows.map(mapOutletRow);
}

export async function createOutlet(
  pool: Pool,
  data: CreateOutletBodySchemaType,
) {
  try {
    assertValid(CreateOutletBodySchema, data);

    const { columns, placeholders, values } = buildAssignments({
      name: data?.name,
      brand_id: data?.brandId,
    });

    const result = await pool.query(
      `
      INSERT INTO outlets (${columns}) VALUES (${placeholders}) 
      RETURNING id, name, brand_id, is_active;`,
      [...values],
    );

    return mapOutletRow(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`Outlet ${data?.name} already exists`);
    }
    if(isForeignKeyViolation(error)){
      throw new NotFoundError("Brand does not exist")
    }

    throw error;
  }
}

export async function updateOutlet(
  pool: Pool,
  outletId: string,
  data: UpdateOutletBodySchemaType,
) {
  try {
    assertValid(OutletParamsSchema, { outletId });
    assertValid(UpdateOutletBodySchema, data);

    const { setClause, values, nextPlaceholder } = buildAssignments({
      name: data.name,
      is_active: data.isActive,
    });

    const result = await pool.query(
      `
      UPDATE outlets o
      SET ${setClause} 
      WHERE o.id = ${nextPlaceholder}
      RETURNING id, name, brand_id, is_active
      `,
      [...values, outletId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Outlet does not exist.");
    }

    return mapOutletRow(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`Outlet ${data?.name} already exists`);
    }
    throw error;
  }
}
