import { NotFoundError } from "../errors.js";
import { Pool } from "pg";

export async function getOutletRecommendations(pool: Pool, outletId: string) {
  let result = await pool.query(`SELECT 1 FROM outlets WHERE id = $1`, [
    outletId,
  ]);

  if (result.rows.length <= 0) {
    throw new NotFoundError("Outlet does not exist.");
  }

  result = await pool.query(
    `SELECT item_ref_id, item_name, item_category, score, computed_at FROM outlet_item_scores WHERE outlet_id = $1 ORDER BY score DESC LIMIT 10`,
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
