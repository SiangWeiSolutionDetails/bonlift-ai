import type { Job } from "bullmq";
import type { CustomerScoringJobData } from "../queue.js";
import { getPool } from "@ai-services/db";

export async function processCustomerScoringJob(
  job: Job<CustomerScoringJobData>,
): Promise<void> {
  const pool = getPool();
  const customerId = job.data.customerId;

  await pool.query(
    `
        INSERT INTO customer_item_scores (
            customer_id,
            brand_id,
            item_ref_id,
            item_name,
            item_category,
            score,
            computed_at
        )
        SELECT
            $1 AS customer_id,
            brand_id,
            item_ref_id,
            item_name,
            item_category,
            sum(qty * recency_weight) AS score,
            now() AS computed_at
        FROM (
            SELECT 
                outlet.brand_id,
                ol.item_ref_id,
                ol.item_name,
                ol.item_category,
                ol.qty,
                CASE 
                    WHEN EXTRACT (epoch FROM (now() - o.ordered_at)) / (24 * 60 * 60) <= 7 THEN 1.0
                    WHEN EXTRACT (epoch FROM (now() - o.ordered_at)) / (24 * 60 * 60) <= 14 THEN 0.6
                    WHEN EXTRACT (epoch FROM (now() - o.ordered_at)) / (24 * 60 * 60) <= 30 THEN 0.3
                    ELSE 0.1
                END AS recency_weight
            FROM order_lines ol
            JOIN orders o 
            ON o.customer_id = $1
            AND ol.order_id = o.id
            JOIN outlets outlet
            ON o.outlet_id = outlet.id
        ) dataset
        GROUP BY brand_id, item_ref_id, item_name, item_category
        ON CONFLICT (
            customer_id,
            brand_id,
            item_ref_id
        )
        DO UPDATE SET 
            item_name = EXCLUDED.item_name,
            item_category = EXCLUDED.item_category,
            score = EXCLUDED.score,
            computed_at = EXCLUDED.computed_at;
    `,
    [customerId],
  );
}
