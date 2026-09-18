import type { Pool } from "pg";
import { NotFoundError, ValidationError } from "../errors.js";
import { isValidUuid } from "../utils/uuid.js";

export async function getOutlet(pool: Pool, outletId: string) {
  if (!isValidUuid(outletId)) {
    throw new ValidationError("Outlet id must be a valid UUID.");
  }
  const result = await pool.query(
    `SELECT o.id FROM outlets o WHERE o.id = $1 LIMIT 1`,
    [outletId],
  );

  if (result.rows.length <= 0) {
    throw new NotFoundError("Outlet does not exist.");
  }

  return result.rows[0];
}
