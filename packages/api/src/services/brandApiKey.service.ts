import {
  BrandApiKeyListSchemaType,
  BrandApiKeyParamsSchema,
  BrandApiKeyRecordSchemaType,
  BrandParamsSchema,
  ChannelCodeSchema,
  CreatedBrandApiKeySchemaType,
  NameSchema,
} from "@bonlift-ai/contracts";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import Type, { Static } from "typebox";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { isUniqueViolationOf } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";

// "<8 hex prefix>.<32 random bytes as base64url>". The secret carries 256 bits, so a fast hash is enough:
// slow hashes (bcrypt) exist for low-entropy passwords, not for random keys.
const API_KEY_PATTERN = /^([0-9a-f]{8})\.[A-Za-z0-9_-]{43}$/;

// Exported so the CLI can recognise this failure and list the brand's channels.
export const UNKNOWN_CHANNEL_MESSAGE = "Channel is unknown.";

const CreateBrandApiKeySchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    name: NameSchema,
    // Exactly one: the admin API sends the id, the CLI the code an operator knows.
    channelId: Type.Optional(Type.String({ format: "uuid" })),
    channelCode: Type.Optional(ChannelCodeSchema),
    createdBy: Type.String({ minLength: 1 }),
    expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 3650 })),
  },
  { additionalProperties: false },
);
export type CreateBrandApiKeyInput = Static<typeof CreateBrandApiKeySchema>;

// Status is worked out in SQL, so "expired" follows the database clock like the serving check does.
const RECORD_COLUMNS = `
  k.id, k.brand_id, k.name, k.channel_id, k.key_prefix, k.created_by, k.created_at, k.expires_at, k.revoked_at,
  (SELECT ch.code FROM channels ch WHERE ch.id = k.channel_id) AS channel_code,
  CASE WHEN k.revoked_at IS NOT NULL THEN 'revoked'
       WHEN k.expires_at <= now() THEN 'expired'
       ELSE 'live'
  END AS status`;

interface BrandApiKeyRow {
  id: string;
  brand_id: string;
  name: string;
  channel_id: string | null;
  channel_code: string | null;
  key_prefix: string;
  status: BrandApiKeyRecordSchemaType["status"];
  created_by: string;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
}

function toRecord(row: BrandApiKeyRow): BrandApiKeyRecordSchemaType {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    channelId: row.channel_id,
    channelCode: row.channel_code,
    keyPrefix: row.key_prefix,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

// channel is null for keys created before channels existed.
export interface BrandApiKeyMatch {
  id: string;
  brandId: string;
  name: string;
  channel: { id: string; code: string; isActive: boolean } | null;
  keyHash: Buffer;
  expiresAt: Date | null;
}

export function hashApiKey(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}

export function generateApiKey(): { key: string; keyPrefix: string } {
  const keyPrefix = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return { key: `${keyPrefix}.${secret}`, keyPrefix };
}

export function parseApiKeyPrefix(presented: string | undefined): string | null {
  return API_KEY_PATTERN.exec(presented ?? "")?.[1] ?? null;
}

export async function listBrandApiKeys(
  pool: Pool,
  brandId: string,
): Promise<BrandApiKeyListSchemaType> {
  assertValid(BrandParamsSchema, { brandId });

  // LEFT JOIN from brands tells "no keys" (one row with a NULL key) apart from "no brand" (no rows) in one query.
  const result = await pool.query(
    `
    SELECT ${RECORD_COLUMNS}
    FROM brands b
    LEFT JOIN brand_api_keys k
      ON k.brand_id = b.id
    WHERE b.id = $1
      AND b.deleted_at IS NULL
    ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC
    `,
    [brandId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }
  return {
    apiKeys: result.rows.filter((row) => row.id !== null).map(toRecord),
  };
}

export async function createBrandApiKey(
  pool: Pool,
  input: CreateBrandApiKeyInput,
): Promise<CreatedBrandApiKeySchemaType> {
  assertValid(CreateBrandApiKeySchema, input);
  if ((input.channelId === undefined) === (input.channelCode === undefined)) {
    throw new ValidationError("Send exactly one of channelId and channelCode.");
  }
  const { key, keyPrefix } = generateApiKey();

  // One statement: no row means no brand, a row without a key means the channel is unknown. Every brand is mapped to
  // every channel, so any known channel resolves.
  // A switched-off channel is allowed: the key only serves once the channel is switched on.
  try {
    const result = await pool.query(
      `
      WITH brand AS (
        SELECT b.id
        FROM brands b
        WHERE b.id = $1
          AND b.deleted_at IS NULL
      ),
      channel AS (
        SELECT bc.channel_id AS id
        FROM brand_channels bc
        JOIN brand ON brand.id = bc.brand_id
        JOIN channels ch ON ch.id = bc.channel_id
        WHERE bc.channel_id = $7::uuid
           OR ch.code = $8::text
      ),
      k AS (
        INSERT INTO brand_api_keys (brand_id, name, channel_id, key_prefix, key_hash, created_by, expires_at)
        SELECT brand.id, $2, channel.id, $3, $4, $5, now() + make_interval(days => $6)
        FROM brand
        CROSS JOIN channel
        RETURNING *
      )
      SELECT ${RECORD_COLUMNS}
      FROM brand
      LEFT JOIN k ON TRUE
      `,
      [
        input.brandId,
        input.name,
        keyPrefix,
        hashApiKey(key),
        input.createdBy,
        input.expiresInDays ?? null,
        input.channelId ?? null,
        input.channelCode ?? null,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Brand does not exist.");
    }
    if (result.rows[0].id === null) {
      throw new ValidationError(UNKNOWN_CHANNEL_MESSAGE);
    }
    return { ...toRecord(result.rows[0]), key };
  } catch (error) {
    if (isUniqueViolationOf(error, "brand_api_keys_brand_name_key")) {
      throw new ConflictError(
        `The brand already has a live key named ${input.name}.`,
      );
    }
    throw error;
  }
}

export async function revokeBrandApiKey(
  pool: Pool,
  keyPrefix: string,
): Promise<{ brandId: string; name: string }> {
  const result = await pool.query(
    `
    UPDATE brand_api_keys
    SET revoked_at = now()
    WHERE key_prefix = $1
      AND revoked_at IS NULL
    RETURNING brand_id, name
    `,
    [keyPrefix],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("No live key has this prefix.");
  }
  return { brandId: result.rows[0].brand_id, name: result.rows[0].name };
}

// The brand is part of the WHERE, so one brand's route can never revoke another brand's key.
export async function revokeBrandApiKeyById(
  pool: Pool,
  brandId: string,
  keyId: string,
): Promise<BrandApiKeyRecordSchemaType> {
  assertValid(BrandApiKeyParamsSchema, { brandId, keyId });

  const result = await pool.query(
    `
    WITH k AS (
      UPDATE brand_api_keys
      SET revoked_at = now()
      WHERE id = $2
        AND brand_id = $1
        AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = $1 AND b.deleted_at IS NULL)
      RETURNING *
    )
    SELECT ${RECORD_COLUMNS}
    FROM k
    `,
    [brandId, keyId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("The brand has no live key with this id.");
  }
  return toRecord(result.rows[0]);
}

// Removes the row for good, so only a key that already can't authenticate (revoked or expired) may be deleted:
// a live key must be revoked first. One statement tells "no such key" apart from "still live".
export async function deleteBrandApiKey(
  pool: Pool,
  brandId: string,
  keyId: string,
): Promise<void> {
  assertValid(BrandApiKeyParamsSchema, { brandId, keyId });

  const result = await pool.query(
    `
    WITH target AS (
      SELECT k.id,
             (k.revoked_at IS NOT NULL OR k.expires_at <= now()) AS deletable
      FROM brand_api_keys k
      WHERE k.id = $2
        AND k.brand_id = $1
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = $1 AND b.deleted_at IS NULL)
    ),
    deleted AS (
      DELETE FROM brand_api_keys k
      USING target t
      WHERE k.id = t.id
        AND t.deletable
      RETURNING k.id
    )
    SELECT t.deletable
    FROM target t
    `,
    [brandId, keyId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("The brand has no key with this id.");
  }
  if (!result.rows[0].deletable) {
    throw new ConflictError("Revoke the key before deleting it.");
  }
}

// Returns the live key with this prefix, or null. The caller compares the hash, so the cache can reuse the row.
// A deleted brand's keys stop authenticating without being revoked (a cached match lasts until its cache entry expires).
export async function findLiveBrandApiKey(
  pool: Pool,
  keyPrefix: string,
): Promise<BrandApiKeyMatch | null> {
  const result = await pool.query(
    `
    SELECT k.id, k.brand_id, k.name, k.key_hash, k.expires_at,
           ch.id AS channel_id, ch.code AS channel_code, bc.is_active AS channel_is_active
    FROM brand_api_keys k
    JOIN brands b
      ON b.id = k.brand_id
    LEFT JOIN brand_channels bc
      ON bc.brand_id = k.brand_id
     AND bc.channel_id = k.channel_id
    LEFT JOIN channels ch
      ON ch.id = bc.channel_id
    WHERE k.key_prefix = $1
      AND k.revoked_at IS NULL
      AND (k.expires_at IS NULL OR k.expires_at > now())
      AND b.deleted_at IS NULL
    `,
    [keyPrefix],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    channel: row.channel_id
      ? { id: row.channel_id, code: row.channel_code, isActive: row.channel_is_active }
      : null,
    keyHash: row.key_hash,
    expiresAt: row.expires_at,
  };
}

export function isSameApiKey(match: BrandApiKeyMatch, presented: string): boolean {
  return timingSafeEqual(match.keyHash, hashApiKey(presented));
}
