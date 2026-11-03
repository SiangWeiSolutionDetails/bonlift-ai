import {
  BrandApiKeyListSchemaType,
  BrandApiKeyParamsSchema,
  BrandApiKeyRecordSchemaType,
  BrandParamsSchema,
  CreatedBrandApiKeySchemaType,
  NameSchema,
} from "@ai-services/contracts";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import Type, { Static } from "typebox";
import { ConflictError, NotFoundError } from "../errors.js";
import { isUniqueViolationOf } from "../utils/pgErrors.js";
import { assertValid } from "../utils/validate.js";

// "<8 hex prefix>.<32 random bytes as base64url>". The secret carries 256 bits, so a fast hash is enough:
// slow hashes (bcrypt) exist for low-entropy passwords, not for random keys.
const API_KEY_PATTERN = /^([0-9a-f]{8})\.[A-Za-z0-9_-]{43}$/;

const CreateBrandApiKeySchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    name: NameSchema,
    createdBy: Type.String({ minLength: 1 }),
    expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 3650 })),
  },
  { additionalProperties: false },
);
export type CreateBrandApiKeyInput = Static<typeof CreateBrandApiKeySchema>;

// Status is worked out in SQL, so "expired" follows the database clock like the serving check does.
const RECORD_COLUMNS = `
  k.id, k.brand_id, k.name, k.key_prefix, k.created_by, k.created_at, k.expires_at, k.revoked_at,
  CASE WHEN k.revoked_at IS NOT NULL THEN 'revoked'
       WHEN k.expires_at <= now() THEN 'expired'
       ELSE 'live'
  END AS status`;

interface BrandApiKeyRow {
  id: string;
  brand_id: string;
  name: string;
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
    keyPrefix: row.key_prefix,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

export interface BrandApiKeyMatch {
  id: string;
  brandId: string;
  name: string;
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
  const { key, keyPrefix } = generateApiKey();

  try {
    const result = await pool.query(
      `
      WITH k AS (
        INSERT INTO brand_api_keys (brand_id, name, key_prefix, key_hash, created_by, expires_at)
        SELECT b.id, $2, $3, $4, $5, now() + make_interval(days => $6)
        FROM brands b
        WHERE b.id = $1
        RETURNING *
      )
      SELECT ${RECORD_COLUMNS}
      FROM k
      `,
      [
        input.brandId,
        input.name,
        keyPrefix,
        hashApiKey(key),
        input.createdBy,
        input.expiresInDays ?? null,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Brand does not exist.");
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
export async function findLiveBrandApiKey(
  pool: Pool,
  keyPrefix: string,
): Promise<BrandApiKeyMatch | null> {
  const result = await pool.query(
    `
    SELECT id, brand_id, name, key_hash, expires_at
    FROM brand_api_keys
    WHERE key_prefix = $1
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    `,
    [keyPrefix],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    keyHash: row.key_hash,
    expiresAt: row.expires_at,
  };
}

export function isSameApiKey(match: BrandApiKeyMatch, presented: string): boolean {
  return timingSafeEqual(match.keyHash, hashApiKey(presented));
}
