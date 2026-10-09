import type { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { buildAssignments } from "../utils/sql.js";
import { isExternalIdViolation, isUniqueViolation } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";
import {
  CreateTenantBodySchema,
  CreateTenantBodySchemaType,
  TenantParamsSchema,
  TenantRecordSchemaType,
  UpdateTenantBodySchema,
  UpdateTenantBodySchemaType,
} from "../schemas/tenant.schema.js";

const TENANT_COLUMNS = "id, external_id, name, is_active";

function mapTenantRow(row: any): TenantRecordSchemaType {
  return {
    id: row.id,
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
      `Tenant with external id ${data.externalId} already exists.`,
    );
  }
  if (isUniqueViolation(error)) {
    return new ConflictError(`Tenant ${data.name} already exists.`);
  }
  return null;
}

export async function getTenant(
  pool: Pool,
  tenantId: string,
): Promise<TenantRecordSchemaType> {
  assertValid(TenantParamsSchema, { tenantId });

  const result = await pool.query(
    `
    SELECT ${TENANT_COLUMNS}
    FROM tenants t
    WHERE t.id = $1
    LIMIT 1;`,
    [tenantId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Tenant does not exist.");
  }

  return mapTenantRow(result.rows[0]);
}

export async function getTenants(
  pool: Pool,
): Promise<TenantRecordSchemaType[]> {
  const result = await pool.query(
    `SELECT ${TENANT_COLUMNS} FROM tenants t ORDER BY t.name, t.id;`,
  );

  return result.rows.map(mapTenantRow);
}

export async function createTenant(
  pool: Pool,
  data: CreateTenantBodySchemaType,
): Promise<TenantRecordSchemaType> {
  try {
    assertValid(CreateTenantBodySchema, data);

    const { columns, placeholders, values } = buildAssignments({
      external_id: data.externalId,
      name: data.name,
    });

    const result = await pool.query(
      `
    INSERT INTO tenants (${columns}) VALUES (${placeholders})
    RETURNING ${TENANT_COLUMNS}`,
      values,
    );

    return mapTenantRow(result.rows[0]);
  } catch (error) {
    throw toConflictError(error, data) ?? error;
  }
}

export async function updateTenant(
  pool: Pool,
  tenantId: string,
  data: UpdateTenantBodySchemaType,
): Promise<TenantRecordSchemaType> {
  try {
    assertValid(TenantParamsSchema, { tenantId });
    assertValid(UpdateTenantBodySchema, data);

    const { setClause, values, nextPlaceholder } = buildAssignments({
      name: data.name,
      is_active: data.isActive,
    });

    const result = await pool.query(
      `
    UPDATE tenants t
    SET ${setClause}, updated_at = now()
    WHERE t.id = ${nextPlaceholder}
    RETURNING ${TENANT_COLUMNS}`,
      [...values, tenantId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Tenant does not exist.");
    }

    return mapTenantRow(result.rows[0]);
  } catch (error) {
    throw toConflictError(error, data) ?? error;
  }
}
