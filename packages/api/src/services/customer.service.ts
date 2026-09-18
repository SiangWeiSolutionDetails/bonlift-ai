import type { Pool } from "pg";
import { NotFoundError, ValidationError } from "../errors.js";
import { isValidUuid } from "../utils/uuid.js";

export async function getCustomer(pool: Pool, customerId: string) {
  if (!isValidUuid(customerId)) {
    throw new ValidationError("Invalid customer id");
  }

  const result = await pool.query(
    `SELECT c.id FROM customers c WHERE c.id = $1 LIMIT 1;`,
    [customerId],
  );

  if (result.rows.length <= 0) {
    throw new NotFoundError("Customer does not exist.");
  }

  return result.rows[0];
}
