import { Pool } from "pg";
import { getOutlet } from "./outlet.service.js";

export async function getOutletRecommendations(pool: Pool, outletId: string) {
  await getOutlet(pool, outletId);

  const result = await pool.query(
    `SELECT item_ref_id, item_name, item_category, score FROM outlet_item_scores WHERE outlet_id = $1 ORDER BY score DESC LIMIT 10`,
    [outletId],
  );

  return {
    outletId: outletId,
    recommendations: result.rows.map((row) => ({
      refId: row.item_ref_id,
      itemName: row.item_name,
      category: row.item_category,
      score: Number(row.score),
    })),
  };
}
