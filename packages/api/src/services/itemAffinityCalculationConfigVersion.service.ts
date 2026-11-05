import {
  BrandParamsSchema,
  CreateItemAffinityCalculationConfigVersionBodySchema,
  CreateItemAffinityCalculationConfigVersionBodySchemaType,
  ItemAffinityCalculationConfigVersionRecordSchemaType,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { isUniqueViolationOf } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";

function mapVersionRow(
  row: any,
): ItemAffinityCalculationConfigVersionRecordSchemaType {
  return {
    id: row.id,
    brandId: row.brand_id,
    jobType: "item_affinity",
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    topN: row.top_n,
    minPairOrders: row.min_pair_orders,
    maxOrderItems: row.max_order_items,
  };
}

// Every brand gets version 1 with the brand, so a brand without one is a bug, not a client error.
function missingVersionError(): Error {
  return new Error("Calculation config version is missing for brand.");
}

export async function getLatestItemAffinityCalculationConfigVersion(
  pool: Pool,
  brandId: string,
): Promise<ItemAffinityCalculationConfigVersionRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT
      v.id,
      b.id AS brand_id,
      v.version,
      v.created_by,
      v.created_at,
      v.top_n,
      v.min_pair_orders,
      v.max_order_items
    FROM brands b
    LEFT JOIN LATERAL (
      SELECT ccv.id, ccv.version, ccv.created_by, ccv.created_at,
        c.top_n, c.min_pair_orders, c.max_order_items
      FROM calculation_config_versions ccv
      JOIN item_affinity_calculation_config_versions c
      ON c.id = ccv.id
      WHERE ccv.brand_id = b.id
      AND ccv.job_type = 'item_affinity'
      ORDER BY ccv.version DESC
      LIMIT 1
    ) v ON TRUE
    WHERE b.id = $1
    AND b.deleted_at IS NULL;
    `,
    [brandId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }
  if (result.rows[0].id === null) {
    throw missingVersionError();
  }

  return mapVersionRow(result.rows[0]);
}

export async function getItemAffinityCalculationConfigVersions(
  pool: Pool,
  brandId: string,
): Promise<ItemAffinityCalculationConfigVersionRecordSchemaType[]> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT
      v.id,
      b.id AS brand_id,
      v.version,
      v.created_by,
      v.created_at,
      v.top_n,
      v.min_pair_orders,
      v.max_order_items
    FROM brands b
    LEFT JOIN (
      SELECT ccv.id, ccv.brand_id, ccv.version, ccv.created_by, ccv.created_at,
        c.top_n, c.min_pair_orders, c.max_order_items
      FROM calculation_config_versions ccv
      JOIN item_affinity_calculation_config_versions c
      ON c.id = ccv.id
      WHERE ccv.job_type = 'item_affinity'
    ) v ON v.brand_id = b.id
    WHERE b.id = $1
    AND b.deleted_at IS NULL
    ORDER BY v.version DESC;
    `,
    [brandId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }
  if (result.rows[0].id === null) {
    throw missingVersionError();
  }

  return result.rows.map(mapVersionRow);
}

// Versions are immutable: a change inserts the next version, taking unsent fields from the latest one.
export async function createItemAffinityCalculationConfigVersion(
  pool: Pool,
  brandId: string,
  data: CreateItemAffinityCalculationConfigVersionBodySchemaType,
  createdBy: string,
): Promise<ItemAffinityCalculationConfigVersionRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(CreateItemAffinityCalculationConfigVersionBodySchema, data);

  try {
    const result = await pool.query(
      `
      WITH
      brand AS (
        SELECT b.id
        FROM brands b
        WHERE b.id = $1
        AND b.deleted_at IS NULL
      ),
      latest AS (
        SELECT ccv.version, c.top_n, c.min_pair_orders, c.max_order_items
        FROM calculation_config_versions ccv
        JOIN item_affinity_calculation_config_versions c
        ON c.id = ccv.id
        WHERE ccv.brand_id = $1
        AND ccv.job_type = 'item_affinity'
        ORDER BY ccv.version DESC
        LIMIT 1
      ),
      parent AS (
        INSERT INTO calculation_config_versions (brand_id, job_type, version, created_by)
        SELECT b.id, 'item_affinity', l.version + 1, $2
        FROM brand b
        CROSS JOIN latest l
        RETURNING id, brand_id, version, created_by, created_at
      ),
      child AS (
        INSERT INTO item_affinity_calculation_config_versions (
          id,
          top_n,
          min_pair_orders,
          max_order_items
        )
        SELECT
          p.id,
          COALESCE($3::int, l.top_n),
          COALESCE($4::int, l.min_pair_orders),
          COALESCE($5::int, l.max_order_items)
        FROM parent p
        CROSS JOIN latest l
        RETURNING id, top_n, min_pair_orders, max_order_items
      )
      SELECT
        p.id,
        b.id AS brand_id,
        p.version,
        p.created_by,
        p.created_at,
        c.top_n,
        c.min_pair_orders,
        c.max_order_items
      FROM brand b
      LEFT JOIN parent p ON TRUE
      LEFT JOIN child c ON c.id = p.id;
      `,
      [
        brandId,
        createdBy,
        data.topN ?? null,
        data.minPairOrders ?? null,
        data.maxOrderItems ?? null,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Brand does not exist.");
    }
    if (result.rows[0].id === null) {
      throw missingVersionError();
    }

    return mapVersionRow(result.rows[0]);
  } catch (error) {
    if (
      isUniqueViolationOf(
        error,
        "calculation_config_versions_brand_job_type_version_key",
      )
    ) {
      throw new ConflictError(
        "Config was changed by someone else. Reload and try again.",
      );
    }
    throw error;
  }
}
