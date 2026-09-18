import type { Pool } from "pg";
import { NotFoundError } from "../errors.js";

export async function getCustomer(pool: Pool, customerId: string) {
  const result = await pool.query(
    `SELECT c.id FROM customers c WHERE c.id = $1 LIMIT 1;`,
    [customerId],
  );

  if (result.rows.length <= 0) {
    throw new NotFoundError("Customer does not exist.");
  }

  return result.rows[0];
}
