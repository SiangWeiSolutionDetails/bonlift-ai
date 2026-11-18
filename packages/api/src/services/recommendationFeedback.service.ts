import {
  RecommendationFeedbackBodySchema,
  RecommendationFeedbackBodySchemaType,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";
import { ValidationError } from "../errors.js";
import { toStoredCustomerId } from "../utils/customerIdHash.js";
import { assertValid } from "../utils/validate.js";

// $1 = the API key's brand id, $2 = item id, $3 = 'accepted' or 'rejected', $4 = hashed customer id.
// The customer's preference is recorded for the brand: a rejection is remembered (the latest rejection wins) and an
// acceptance forgets it, together with when the item was last shown, so an accepted item is not moved down on the next
// serves. Repeating the same feedback changes nothing more, so a retry is safe.
const RECORD_FEEDBACK_SQL = `
WITH remembered AS (
  INSERT INTO customer_item_rejections (brand_id, customer_external_id, external_item_id, rejected_at)
  SELECT $1::uuid, $4::text, $2::text, now()
  WHERE $3::text = 'rejected'
  ON CONFLICT (brand_id, customer_external_id, external_item_id)
  DO UPDATE SET rejected_at = EXCLUDED.rejected_at
),
forgotten AS (
  DELETE FROM customer_item_rejections r
  WHERE $3 = 'accepted'
    AND r.brand_id = $1
    AND r.customer_external_id = $4
    AND r.external_item_id = $2
)
DELETE FROM customer_item_exposures e
WHERE $3 = 'accepted'
  AND e.brand_id = $1
  AND e.customer_external_id = $4
  AND e.external_item_id = $2;
`;

// A database error is thrown (500): feedback is sent in the background and the write is idempotent, so the caller can
// retry.
export async function recordRecommendationFeedback(
  pool: Pool,
  brandId: string,
  body: RecommendationFeedbackBodySchemaType,
  customerIdSecret: string,
): Promise<void> {
  assertValid(RecommendationFeedbackBodySchema, body);
  const customerId = toStoredCustomerId(customerIdSecret, body.customerId);
  if (customerId === null) {
    throw new ValidationError("customerId is required: only identified customers can give feedback.");
  }

  await pool.query(RECORD_FEEDBACK_SQL, [brandId, body.itemId, body.type, customerId]);
}
