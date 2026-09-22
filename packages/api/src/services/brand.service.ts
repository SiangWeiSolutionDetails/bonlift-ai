import type { Pool } from "pg";
import { NotFoundError, ValidationError } from "../errors.js";
import { isValidUuid } from "../utils/uuid.js";

export async function getBrand(pool: Pool, brandId: string) {
  if (!isValidUuid(brandId)) {
    throw new ValidationError("Brand id must be a valid UUID.");
  }

  const result = await pool.query(
    `SELECT b.id FROM brands b WHERE b.id = $1 AND b.is_active IS TRUE LIMIT 1;`,
    [brandId],
  );

  if (result.rows.length <= 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return result.rows[0];
}
