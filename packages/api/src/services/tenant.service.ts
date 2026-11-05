import type { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { buildAssignments } from "../utils/sql.js";
import { isUniqueViolation } from "../utils/pgErrors.js";
import { withTransaction } from "../utils/transaction.js";
import { assertValid } from "../utils/validate.js";
import {
  CreateTenantBodySchema,
  CreateTenantBodySchemaType,
  TenantParamsSchema,
  TenantRecordSchemaType,
  UpdateTenantBodySchema,
  UpdateTenantBodySchemaType,
} from "@bonlift-ai/contracts";

const TENANT_COLUMNS = "id, name, is_active";

function mapTenantRow(row: any): TenantRecordSchemaType {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  };
}

function toConflictError(error: unknown, data: { name?: string }) {
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
      AND t.deleted_at IS NULL
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
    `SELECT ${TENANT_COLUMNS} FROM tenants t WHERE t.deleted_at IS NULL ORDER BY t.name, t.id;`,
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
      AND t.deleted_at IS NULL
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

// Soft delete cascading to the tenant's brands and outlets; now() is fixed per transaction, so they share one deleted_at.
// Separate statements on purpose: each takes a fresh snapshot after the previous one's row locks, so a brand or outlet
// created concurrently (its insert holds FOR SHARE on the parent) is either committed and cascaded, or sees the parent deleted.
export async function deleteTenant(
  pool: Pool,
  tenantId: string,
): Promise<void> {
  assertValid(TenantParamsSchema, { tenantId });

  await withTransaction(pool, async (client) => {
    const result = await client.query(
      `
      UPDATE tenants
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1
        AND deleted_at IS NULL`,
      [tenantId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Tenant does not exist.");
    }

    await client.query(
      `
      UPDATE brands
      SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = $1
        AND deleted_at IS NULL`,
      [tenantId],
    );

    await client.query(
      `
      UPDATE outlets
      SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = $1
        AND deleted_at IS NULL`,
      [tenantId],
    );
  });
}
