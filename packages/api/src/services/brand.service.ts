import type { Pool } from "pg";
import { NotFoundError } from "../errors.js";

export async function getBrand(pool: Pool, brandId: string) {
  const result = await pool.query(
    `SELECT b.id FROM brands b WHERE b.id = $1 LIMIT 1;`,
    [brandId],
  );

  if (result.rows.length <= 0) {
    throw new NotFoundError("Brand does not exist.");
  }

  return result.rows[0];
}
