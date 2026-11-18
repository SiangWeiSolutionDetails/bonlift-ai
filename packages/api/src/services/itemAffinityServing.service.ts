import {
  ALL_DAY_DAYPART,
  ItemAffinityRequestSchema,
  ItemAffinityRequestSchemaType,
  ItemAffinityResponseSchemaType,
} from "@bonlift-ai/contracts";
import type { FastifyBaseLogger } from "fastify";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { toStoredCustomerId } from "../utils/customerIdHash.js";
import { assertValid } from "../utils/validate.js";
import type { RecommendationServe } from "./recommendation.service.js";

// $1 = the API key's brand id, $2 = item ids to find partners for (the target item, else the cart), $3 = item ids to
// remove (target, cart and exclude), $4 = item ids allowed to be returned, empty for any, $5 = limit or NULL for all,
// $6 = customer id or NULL, $7 = outlet id or NULL.
// A partner of several cart items is returned once, ranked by its best confidence, then lift; item id keeps ties stable.
// An identified customer is never served an item they rejected within the brand's rejection window; a window of 0 days
// suppresses nothing. Items shown before are not moved down here: cart pairings stay strongest first.
// outlet_in_brand says whether $7 is an active outlet of the brand; only then can the serve be recorded for feedback.
// Returns no rows for an inactive or deleted brand or no published run; otherwise at least one row, with a NULL item
// when none matches.
const SERVE_ITEM_AFFINITY_SQL = `
WITH affinity_run AS (
  SELECT p.run_id
  FROM brands b
  JOIN brand_published_runs p
    ON p.brand_id = b.id
   AND p.job_type = 'item_affinity'
  WHERE b.id = $1
    AND b.is_active
    AND b.deleted_at IS NULL
),
outlet AS (
  SELECT o.id
  FROM outlets o
  WHERE o.id = $7::uuid
    AND o.brand_id = $1
    AND o.is_active
    AND o.deleted_at IS NULL
),
serving_config AS (
  SELECT c.rejection_suppression_days
  FROM serving_config_versions c
  WHERE c.brand_id = $1
  ORDER BY c.version DESC
  LIMIT 1
),
rejected_items AS (
  SELECT r.external_item_id
  FROM serving_config sc
  JOIN customer_item_rejections r
    ON r.brand_id = $1
   AND r.customer_external_id = $6::text
   AND r.rejected_at > now() - make_interval(days => sc.rejection_suppression_days)
),
partners AS (
  SELECT s.item_b, MAX(s.confidence) AS confidence, MAX(s.lift) AS lift
  FROM affinity_run ar
  JOIN item_affinity_scores s
    ON s.run_id = ar.run_id
   AND s.item_a = ANY($2::text[])
  WHERE s.item_b <> ALL($3::text[])
    AND (cardinality($4::text[]) = 0 OR s.item_b = ANY($4::text[]))
    AND NOT EXISTS (SELECT 1 FROM rejected_items ri WHERE ri.external_item_id = s.item_b)
  GROUP BY s.item_b
  ORDER BY confidence DESC, lift DESC, s.item_b
  LIMIT $5
)
SELECT ar.run_id, p.item_b AS external_item_id, EXISTS (SELECT 1 FROM outlet) AS outlet_in_brand
FROM affinity_run ar
LEFT JOIN partners p
  ON TRUE
ORDER BY p.confidence DESC, p.lift DESC, p.item_b;
`;

const NO_ITEMS: ItemAffinityResponseSchemaType = { recommendationId: null, runId: null, items: [] };

interface ServedRow {
  run_id: string;
  external_item_id: string | null;
  outlet_in_brand: boolean;
}

export interface ServedItemAffinity {
  response: ItemAffinityResponseSchemaType;
  // Null unless an identified customer was served items at an outlet of the brand: otherwise there is nothing to give
  // feedback on.
  serve: RecommendationServe | null;
}

function toItems(rows: ServedRow[]): ItemAffinityResponseSchemaType["items"] {
  return rows
    .filter((row) => row.external_item_id !== null)
    .map((row, index) => ({
      itemId: row.external_item_id as string,
      rank: index + 1,
      reason: "often_ordered_with",
    }));
}

// Only identified customers at an outlet of the brand can give feedback, so only their responses are identified.
function toResponse(rows: ServedRow[], identified: boolean): ItemAffinityResponseSchemaType {
  const first = rows[0];
  if (!first) {
    return NO_ITEMS;
  }

  const items = toItems(rows);
  const recordable = identified && first.outlet_in_brand && items.length > 0;
  return { recommendationId: recordable ? randomUUID() : null, runId: first.run_id, items };
}

// Item affinity is not daypart-specific, so the serve is recorded for the whole day.
function toServe(
  brandId: string,
  outletId: string | undefined,
  storedCustomerId: string | null,
  response: ItemAffinityResponseSchemaType,
): RecommendationServe | null {
  if (response.recommendationId === null || storedCustomerId === null || outletId === undefined) return null;
  return {
    id: response.recommendationId,
    brandId,
    storedCustomerId,
    outletId,
    daypart: ALL_DAY_DAYPART,
    runId: null,
    customerRunId: null,
    affinityRunId: response.runId,
    itemIds: response.items.map((item) => item.itemId),
    reasons: response.items.map((item) => item.reason),
  };
}

function uniqueItemIds(itemIds: string[]): string[] {
  return [...new Set(itemIds)];
}

async function serveResponse(
  pool: Pool,
  log: Pick<FastifyBaseLogger, "error">,
  brandId: string,
  request: ItemAffinityRequestSchemaType,
  customerId: string | null,
): Promise<ItemAffinityResponseSchemaType> {
  const cartItemIds = uniqueItemIds(request.cart.map((item) => item.itemId));
  const targetItemIds = request.itemId ? [request.itemId] : cartItemIds;

  try {
    const result = await pool.query<ServedRow>(SERVE_ITEM_AFFINITY_SQL, [
      brandId,
      targetItemIds,
      uniqueItemIds([...targetItemIds, ...cartItemIds, ...(request.exclude ?? [])]),
      uniqueItemIds(request.include ?? []),
      request.limit ?? null,
      customerId,
      request.outletId ?? null,
    ]);
    return toResponse(result.rows, customerId !== null);
  } catch (error) {
    log.error({ err: error, brandId }, "Item affinity recommendations failed");
    return NO_ITEMS;
  }
}

// A malformed request gets a 400; anything else returns an empty list so the order is never blocked (NF-2).
// The response does not say whether another brand's outlet exists: it is only never identified.
export async function getItemAffinityRecommendations(
  pool: Pool,
  log: Pick<FastifyBaseLogger, "error">,
  brandId: string,
  request: ItemAffinityRequestSchemaType,
  customerIdSecret: string,
): Promise<ServedItemAffinity> {
  assertValid(ItemAffinityRequestSchema, request);
  const customerId = toStoredCustomerId(customerIdSecret, request.customerId);

  const response = await serveResponse(pool, log, brandId, request, customerId);
  return { response, serve: toServe(brandId, request.outletId, customerId, response) };
}
