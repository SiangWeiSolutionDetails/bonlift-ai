import {
  RecommendationFeedbackBodySchema,
  RecommendationFeedbackBodySchemaType,
  RecommendationFeedbackParamsSchema,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";
import { toStoredCustomerId } from "../utils/customerIdHash.js";
import { assertValid } from "../utils/validate.js";

// $1 = recommendation id, $2 = the API key's brand id, $3 = item id, $4 = 'accepted' or 'rejected',
// $5 = hashed customer id or NULL.
// Feedback only counts for an item of the brand's own serve, within 2 hours of it; anything else matches no serve and
// changes nothing. Each item is added to its array once, so a retry adds nothing.
// For an identified serve sent with a customer id, a rejection is remembered for that customer (the latest rejection
// wins) and an acceptance forgets it. Every write hangs off the serve update, so nothing happens without a match.
const RECORD_FEEDBACK_SQL = `
WITH feedback AS (
  UPDATE recommendation_serves s
  SET accepted_item_ids = CASE
        WHEN $4::text = 'accepted' AND $3 <> ALL(s.accepted_item_ids) THEN array_append(s.accepted_item_ids, $3)
        ELSE s.accepted_item_ids
      END,
      rejected_item_ids = CASE
        WHEN $4 = 'rejected' AND $3 <> ALL(s.rejected_item_ids) THEN array_append(s.rejected_item_ids, $3)
        ELSE s.rejected_item_ids
      END
  WHERE s.id = $1
    AND s.brand_id = $2
    AND $3 = ANY(s.item_ids)
    AND s.served_at > now() - interval '2 hours'
  RETURNING s.brand_id, s.is_identified
),
customer AS (
  SELECT f.brand_id
  FROM feedback f
  WHERE f.is_identified
    AND $5::text IS NOT NULL
),
remembered AS (
  INSERT INTO customer_item_rejections (brand_id, customer_external_id, external_item_id, rejected_at)
  SELECT c.brand_id, $5, $3, now()
  FROM customer c
  WHERE $4 = 'rejected'
  ON CONFLICT (brand_id, customer_external_id, external_item_id)
  DO UPDATE SET rejected_at = EXCLUDED.rejected_at
),
forgotten AS (
  DELETE FROM customer_item_rejections r
  USING customer c
  WHERE $4 = 'accepted'
    AND r.brand_id = c.brand_id
    AND r.customer_external_id = $5
    AND r.external_item_id = $3
)
SELECT count(*)::int AS matched
FROM feedback;
`;

// Never says whether the serve matched, so a key cannot probe other brands' recommendation ids. A database error is
// thrown (500): feedback is sent in the background and the write is idempotent, so the caller can retry.
export async function recordRecommendationFeedback(
  pool: Pool,
  brandId: string,
  recommendationId: string,
  body: RecommendationFeedbackBodySchemaType,
  customerIdSecret: string,
): Promise<void> {
  assertValid(RecommendationFeedbackParamsSchema, { recommendationId });
  assertValid(RecommendationFeedbackBodySchema, body);
  const customerId = toStoredCustomerId(customerIdSecret, body.customerId);

  await pool.query(RECORD_FEEDBACK_SQL, [recommendationId, brandId, body.itemId, body.type, customerId]);
}
