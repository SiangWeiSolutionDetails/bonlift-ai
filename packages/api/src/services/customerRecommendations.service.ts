import type { Pool } from "pg";
import { getCustomer } from "./customer.service.js";
import { getBrand } from "./brand.service.js";

export async function getCustomerRecommendations(
  pool: Pool,
  customerId: string,
  brandId?: string,
) {
  await getCustomer(pool, customerId);

  const conditions = ["cis.customer_id = $1"];
  const params = [customerId];

  if (brandId) {
    await getBrand(pool, brandId);
    conditions.push("cis.brand_id = $2");
    params.push(brandId);
  }

  const result = await pool.query(
    `
      SELECT 
        cis.item_ref_id,
        cis.item_name,
        cis.item_category,
        cis.score
      FROM customer_item_scores cis
      WHERE ${conditions.join(" AND ")}
      ORDER BY score DESC;
    `,
    params,
  );

  return {
    customerId: customerId,
    brandId: brandId,
    recommendations: result.rows.map((row) => ({
      refId: row.item_ref_id,
      itemName: row.item_name,
      category: row.item_category,
      score: Number(row.score),
    })),
  };
}
