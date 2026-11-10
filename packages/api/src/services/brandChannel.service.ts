import {
  BrandChannelListSchemaType,
  BrandChannelParamsSchema,
  BrandChannelRecordSchemaType,
  BrandParamsSchema,
  UpdateBrandChannelBodySchema,
  UpdateBrandChannelBodySchemaType,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";
import { NotFoundError } from "../errors.js";
import { assertValid } from "../utils/validate.js";

const RECORD_COLUMNS = `bc.brand_id, bc.channel_id, c.code, c.name, bc.is_active, bc.updated_at`;

interface BrandChannelRow {
  brand_id: string;
  channel_id: string;
  code: string;
  name: string;
  is_active: boolean;
  updated_at: Date;
}

function toRecord(row: BrandChannelRow): BrandChannelRecordSchemaType {
  return {
    brandId: row.brand_id,
    channelId: row.channel_id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listBrandChannels(
  pool: Pool,
  brandId: string,
): Promise<BrandChannelListSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  // LEFT JOIN from brands tells "no channels" (one row with a NULL channel) apart from "no brand" (no rows).
  const result = await pool.query(
    `
    SELECT ${RECORD_COLUMNS}
    FROM brands b
    LEFT JOIN brand_channels bc
      ON bc.brand_id = b.id
    LEFT JOIN channels c
      ON c.id = bc.channel_id
    WHERE b.id = $1
      AND b.deleted_at IS NULL
    ORDER BY c.code
    `,
    [brandId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }
  return {
    channels: result.rows.filter((row) => row.channel_id !== null).map(toRecord),
  };
}

// Every brand has a row for every channel, so switching is an UPDATE; no row means an unknown brand or channel.
export async function updateBrandChannel(
  pool: Pool,
  brandId: string,
  channelId: string,
  data: UpdateBrandChannelBodySchemaType,
): Promise<BrandChannelRecordSchemaType> {
  assertValid(BrandChannelParamsSchema, { brandId, channelId });
  assertValid(UpdateBrandChannelBodySchema, data);

  const result = await pool.query(
    `
    UPDATE brand_channels bc
    SET is_active = $3,
        updated_at = now()
    FROM channels c, brands b
    WHERE bc.brand_id = $1
      AND bc.channel_id = $2
      AND c.id = bc.channel_id
      AND b.id = bc.brand_id
      AND b.deleted_at IS NULL
    RETURNING ${RECORD_COLUMNS}
    `,
    [brandId, channelId, data.isActive],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("The brand has no channel with this id.");
  }
  return toRecord(result.rows[0]);
}
