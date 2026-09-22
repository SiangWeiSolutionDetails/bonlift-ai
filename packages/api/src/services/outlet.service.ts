import type { Pool } from "pg";
import { NotFoundError, ValidationError } from "../errors.js";
import { isValidUuid } from "../utils/uuid.js";

export async function getOutlet(pool: Pool, outletId: string) {
  if (!isValidUuid(outletId)) {
    throw new ValidationError("Outlet id must be a valid UUID.");
  }
  const result = await pool.query(
    `
    SELECT o.id FROM outlets o 
    JOIN brands b 
    ON o.brand_id = b.id
    WHERE o.id = $1  
    AND o.is_active IS TRUE
    AND b.is_active IS TRUE
    LIMIT 1;
    `,
    [outletId],
  );

  if (result.rows.length <= 0) {
    throw new NotFoundError("Outlet does not exist.");
  }

  return result.rows[0];
}
