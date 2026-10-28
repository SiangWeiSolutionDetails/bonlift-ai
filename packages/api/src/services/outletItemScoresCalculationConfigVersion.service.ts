import {
  BrandParamsSchema,
  CreateOutletItemScoresCalculationConfigVersionBodySchema,
  CreateOutletItemScoresCalculationConfigVersionBodySchemaType,
  OutletItemScoresCalculationConfigVersionRecordSchemaType,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { ConflictError, NotFoundError } from "../errors.js";
import { assertValidDayparts } from "../utils/dayparts.js";
import { isUniqueViolationOf } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";

function mapVersionRow(
  row: any,
): OutletItemScoresCalculationConfigVersionRecordSchemaType {
  return {
    id: row.id,
    brandId: row.brand_id,
    jobType: "outlet_item_scores",
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    halfLifeDays: row.half_life_days,
    topN: row.top_n,
    dayparts: row.dayparts,
  };
}

// Every brand gets version 1 with the brand, so a brand without one is a bug, not a client error.
function missingVersionError(): Error {
  return new Error("Calculation config version is missing for brand.");
}

export async function getLatestOutletItemScoresCalculationConfigVersion(
  pool: Pool,
  brandId: string,
): Promise<OutletItemScoresCalculationConfigVersionRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT
      v.id,
      b.id AS brand_id,
      v.version,
      v.created_by,
      v.created_at,
      v.half_life_days,
      v.top_n,
      v.dayparts
    FROM brands b
    LEFT JOIN LATERAL (
      SELECT ccv.id, ccv.version, ccv.created_by, ccv.created_at,
        c.half_life_days, c.top_n, c.dayparts
      FROM calculation_config_versions ccv
      JOIN outlet_item_scores_calculation_config_versions c
      ON c.id = ccv.id
      WHERE ccv.brand_id = b.id
      AND ccv.job_type = 'outlet_item_scores'
      ORDER BY ccv.version DESC
      LIMIT 1
    ) v ON TRUE
    WHERE b.id = $1;
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

export async function getOutletItemScoresCalculationConfigVersions(
  pool: Pool,
  brandId: string,
): Promise<OutletItemScoresCalculationConfigVersionRecordSchemaType[]> {
  assertValid(BrandParamsSchema, { brandId });

  const result = await pool.query(
    `
    SELECT
      v.id,
      b.id AS brand_id,
      v.version,
      v.created_by,
      v.created_at,
      v.half_life_days,
      v.top_n,
      v.dayparts
    FROM brands b
    LEFT JOIN (
      SELECT ccv.id, ccv.brand_id, ccv.version, ccv.created_by, ccv.created_at,
        c.half_life_days, c.top_n, c.dayparts
      FROM calculation_config_versions ccv
      JOIN outlet_item_scores_calculation_config_versions c
      ON c.id = ccv.id
      WHERE ccv.job_type = 'outlet_item_scores'
    ) v ON v.brand_id = b.id
    WHERE b.id = $1
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
export async function createOutletItemScoresCalculationConfigVersion(
  pool: Pool,
  brandId: string,
  data: CreateOutletItemScoresCalculationConfigVersionBodySchemaType,
  createdBy: string,
): Promise<OutletItemScoresCalculationConfigVersionRecordSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(CreateOutletItemScoresCalculationConfigVersionBodySchema, data);
  if (data.dayparts !== undefined) assertValidDayparts(data.dayparts);

  try {
    const result = await pool.query(
      `
      WITH
      brand AS (
        SELECT b.id
        FROM brands b
        WHERE b.id = $1
      ),
      latest AS (
        SELECT ccv.version, c.half_life_days, c.top_n, c.dayparts
        FROM calculation_config_versions ccv
        JOIN outlet_item_scores_calculation_config_versions c
        ON c.id = ccv.id
        WHERE ccv.brand_id = $1
        AND ccv.job_type = 'outlet_item_scores'
        ORDER BY ccv.version DESC
        LIMIT 1
      ),
      parent AS (
        INSERT INTO calculation_config_versions (brand_id, job_type, version, created_by)
        SELECT b.id, 'outlet_item_scores', l.version + 1, $2
        FROM brand b
        CROSS JOIN latest l
        RETURNING id, brand_id, version, created_by, created_at
      ),
      child AS (
        INSERT INTO outlet_item_scores_calculation_config_versions (
          id,
          half_life_days,
          top_n,
          dayparts
        )
        SELECT
          p.id,
          COALESCE($3::int, l.half_life_days),
          COALESCE($4::int, l.top_n),
          COALESCE($5::jsonb, l.dayparts)
        FROM parent p
        CROSS JOIN latest l
        RETURNING id, half_life_days, top_n, dayparts
      )
      SELECT
        p.id,
        b.id AS brand_id,
        p.version,
        p.created_by,
        p.created_at,
        c.half_life_days,
        c.top_n,
        c.dayparts
      FROM brand b
      LEFT JOIN parent p ON TRUE
      LEFT JOIN child c ON c.id = p.id;
      `,
      [
        brandId,
        createdBy,
        data.halfLifeDays ?? null,
        data.topN ?? null,
        data.dayparts === undefined ? null : JSON.stringify(data.dayparts),
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
