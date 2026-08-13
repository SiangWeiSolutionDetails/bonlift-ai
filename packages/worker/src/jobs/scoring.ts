import type { Job } from "bullmq";
import type { OutletScoringJobData } from "../queue.js";
import { getPool } from "@ai-services/db";

export async function processOutletScoringJob(
  job: Job<OutletScoringJobData>,
): Promise<void> {
  const pool = getPool();
  const outletId = job.data.outletId;
  const now = new Date();

  let result = await pool.query(
    `
    WITH
    as_of AS (
        SELECT CASE
    	    WHEN EXTRACT(HOUR FROM $1::timestamptz) BETWEEN 5 AND 10 THEN 'breakfast'
    	    WHEN EXTRACT(HOUR FROM $1::timestamptz) BETWEEN 11 AND 16 THEN 'lunch'
    	    WHEN EXTRACT(HOUR FROM $1::timestamptz) BETWEEN 17 AND 21 THEN 'dinner'
    	  END AS as_of_meal_period
    ),
    lines AS (
    SELECT
    	ol.item_ref_id,
    	ol.item_name,
    	ol.item_category,
    	ol.qty,
    	o.ordered_at,
    	EXTRACT(EPOCH FROM ($1::timestamptz - o.ordered_at)) / (60 * 60 * 24)  AS days_ago,
    	CASE
    		WHEN EXTRACT(HOUR FROM o.ordered_at) BETWEEN 5 AND 10 THEN 'breakfast'
    		WHEN EXTRACT(HOUR FROM o.ordered_at) BETWEEN 11 AND 16 THEN 'lunch'
    		WHEN EXTRACT(HOUR FROM o.ordered_at) BETWEEN 17 AND 21 THEN 'dinner'
    	END AS meal_period
    FROM order_lines ol
    JOIN orders o
    ON ol.order_id = o.id AND o.outlet_id = $2
    ),
    weight AS (
    SELECT
    	item_ref_id,
    	item_name,
    	item_category,
    	qty,
    	CASE
    		WHEN days_ago <= 7 THEN 1.0
    		WHEN days_ago <= 14 THEN 0.6
    		WHEN days_ago <= 30 THEN 0.3
    		else 0.1
    	END AS recency_weight,
    	CASE
    		WHEN EXTRACT(DOW FROM $1::timestamptz) = EXTRACT(DOW FROM ordered_at) THEN 1.5
    		else 1.0
    	END AS dow_multiplier,
    	CASE
    		WHEN meal_period = (SELECT as_of_meal_period FROM as_of) THEN 1.3
    		else 1.0
    	END	AS time_of_day_multiplier
    FROM lines
    )
    SELECT
    	item_ref_id,
    	MAX(item_name) AS item_name,
    	MAX(item_category) AS item_category,
    	SUM (qty * recency_weight * dow_multiplier * time_of_day_multiplier) AS score
    FROM weight
    GROUP BY item_ref_id
    ORDER BY score DESC;
    `,
    [now, outletId],
  );

  if (result.rows.length <= 0) return;

  const placeholders: string[] = [];
  const values: unknown[] = [];

  result.rows.forEach((row, i) => {
    const offset = i * 6;
    placeholders.push(
      `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`,
    );
    values.push(
      outletId,
      row.item_ref_id,
      row.item_name,
      row.item_category,
      row.score,
      now,
    );
  });

  await pool.query(
    `
    INSERT INTO outlet_item_scores (
      outlet_id,
      item_ref_id,
      item_name,
      item_category,
      score,
      computed_at
    ) VALUES ${placeholders.join(",")}
    ON CONFLICT (outlet_id, item_ref_id)
    DO UPDATE SET
      item_name = EXCLUDED.item_name,
      item_category = EXCLUDED.item_category,
      score = EXCLUDED.score,
      computed_at = EXCLUDED.computed_at;
    `,
    values,
  );
}
