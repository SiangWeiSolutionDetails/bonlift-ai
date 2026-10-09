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
import {
  isExternalIdViolation,
  isForeignKeyViolation,
  isUniqueViolation,
} from "../utils/pgErrors.js";

const OUTLET_COLUMNS = "id, tenant_id, brand_id, external_id, name, is_active";

function mapOutletRow(row: any): OutletRecordSchemaType {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    brandId: row.brand_id,
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
      `Outlet with external id ${data.externalId} already exists for this tenant.`,
    );
  }
  if (isUniqueViolation(error)) {
    return new ConflictError(
      `Outlet ${data.name} already exists for this brand.`,
    );
  }
  return null;
}

export async function getOutlet(
  pool: Pool,
  outletId: string,
): Promise<OutletRecordSchemaType> {
  assertValid(OutletParamsSchema, { outletId });

  const result = await pool.query(
    `
    SELECT ${OUTLET_COLUMNS}
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

export async function getOutlets(
  pool: Pool,
  options: OutletQuerySchemaType,
): Promise<OutletRecordSchemaType[]> {
  const tenantId = options?.tenantId;
  const brandId = options?.brandId;

  assertValid(OutletQuerySchema, { tenantId, brandId });

  const conditions = [];
  const values = [];

  if (tenantId) {
    values.push(tenantId);
    conditions.push(`o.tenant_id = $${values.length}`);
  }

  if (brandId) {
    values.push(brandId);
    conditions.push(`o.brand_id = $${values.length}`);
  }

  const result = await pool.query(
    `
    SELECT ${OUTLET_COLUMNS}
    FROM outlets o
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY o.name, o.id;
    `,
    values,
  );

  return result.rows.map(mapOutletRow);
}

export async function createOutlet(
  pool: Pool,
  data: CreateOutletBodySchemaType,
): Promise<OutletRecordSchemaType> {
  try {
    assertValid(CreateOutletBodySchema, data);

    const result = await pool.query(
      `
      INSERT INTO outlets (tenant_id, brand_id, external_id, name)
      SELECT b.tenant_id, b.id, $2::text, $3::text
      FROM brands b
      WHERE b.id = $1
      RETURNING ${OUTLET_COLUMNS};`,
      [data.brandId, data.externalId, data.name],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Brand does not exist.");
    }

    return mapOutletRow(result.rows[0]);
  } catch (error) {
    // The brand can still disappear between the SELECT and the FK check.
    if (isForeignKeyViolation(error)) {
      throw new NotFoundError("Brand does not exist.");
    }
    throw toConflictError(error, data) ?? error;
  }
}

export async function updateOutlet(
  pool: Pool,
  outletId: string,
  data: UpdateOutletBodySchemaType,
): Promise<OutletRecordSchemaType> {
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
      SET ${setClause}, updated_at = now()
      WHERE o.id = ${nextPlaceholder}
      RETURNING ${OUTLET_COLUMNS}
      `,
      [...values, outletId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Outlet does not exist.");
    }

    return mapOutletRow(result.rows[0]);
  } catch (error) {
    throw toConflictError(error, data) ?? error;
  }
}
