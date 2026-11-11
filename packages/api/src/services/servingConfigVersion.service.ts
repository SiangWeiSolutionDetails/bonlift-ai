import {
  BrandParamsSchema,
  CreateServingConfigVersionBodySchema,
  CreateServingConfigVersionBodySchemaType,
  ServingConfigVersionRecordSchemaType,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { isUniqueViolationOf } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";

function mapVersionRow(row: any): ServingConfigVersionRecordSchemaType {
  return {
    id: row.id,
    brandId: row.brand_id,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    minFavouriteOrders: row.min_favourite_orders,
    bestSellerMaxRank: row.best_seller_max_rank,
    bestSellerMinListSize: row.best_seller_min_list_size,
  };
}

// Every brand gets version 1 with the brand, so a brand without one is a bug, not a client error.
function missingVersionError(): Error {
  return new Error("Serving config version is missing for brand.");
}

export async function getLatestServingConfigVersion(
  pool: Pool,
  brandId: string,
): Promise<ServingConfigVersionRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT
      v.id,
      b.id AS brand_id,
      v.version,
      v.created_by,
      v.created_at,
      v.min_favourite_orders,
      v.best_seller_max_rank,
      v.best_seller_min_list_size
    FROM brands b
    LEFT JOIN LATERAL (
      SELECT s.id, s.version, s.created_by, s.created_at,
        s.min_favourite_orders,
        s.best_seller_max_rank, s.best_seller_min_list_size
      FROM serving_config_versions s
      WHERE s.brand_id = b.id
      ORDER BY s.version DESC
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

export async function getServingConfigVersions(
  pool: Pool,
  brandId: string,
): Promise<ServingConfigVersionRecordSchemaType[]> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT
      v.id,
      b.id AS brand_id,
      v.version,
      v.created_by,
      v.created_at,
      v.min_favourite_orders,
      v.best_seller_max_rank,
      v.best_seller_min_list_size
    FROM brands b
    LEFT JOIN serving_config_versions v ON v.brand_id = b.id
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
export async function createServingConfigVersion(
  pool: Pool,
  brandId: string,
  data: CreateServingConfigVersionBodySchemaType,
  createdBy: string,
): Promise<ServingConfigVersionRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(CreateServingConfigVersionBodySchema, data);

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
        SELECT s.version, s.min_favourite_orders,
          s.best_seller_max_rank, s.best_seller_min_list_size
        FROM serving_config_versions s
        WHERE s.brand_id = $1
        ORDER BY s.version DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO serving_config_versions (
          brand_id,
          version,
          created_by,
          min_favourite_orders,
          best_seller_max_rank,
          best_seller_min_list_size
        )
        SELECT
          b.id,
          l.version + 1,
          $2,
          COALESCE($3::int, l.min_favourite_orders),
          COALESCE($4::int, l.best_seller_max_rank),
          COALESCE($5::int, l.best_seller_min_list_size)
        FROM brand b
        CROSS JOIN latest l
        RETURNING id, brand_id, version, created_by, created_at,
          min_favourite_orders,
          best_seller_max_rank, best_seller_min_list_size
      )
      SELECT
        i.id,
        b.id AS brand_id,
        i.version,
        i.created_by,
        i.created_at,
        i.min_favourite_orders,
        i.best_seller_max_rank,
        i.best_seller_min_list_size
      FROM brand b
      LEFT JOIN inserted i ON TRUE;
      `,
      [
        brandId,
        createdBy,
        data.minFavouriteOrders ?? null,
        data.bestSellerMaxRank ?? null,
        data.bestSellerMinListSize ?? null,
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
    if (isUniqueViolationOf(error, "serving_config_versions_brand_version_key")) {
      throw new ConflictError(
        "Config was changed by someone else. Reload and try again.",
      );
    }
    throw error;
  }
}
