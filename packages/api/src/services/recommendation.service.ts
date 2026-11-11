import {
  ALL_DAY_DAYPART,
  RecommendationDetailSchemaType,
  RecommendationItemSchemaType,
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchemaType,
} from "@bonlift-ai/contracts";
import type { FastifyBaseLogger } from "fastify";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { toStoredCustomerId } from "../utils/customerIdHash.js";
import { assertValid } from "../utils/validate.js";

// Callers word the reason from the first few cart items; a big cart would otherwise list every one.
const MAX_BASED_ON = 3;

// $1 = outlet id, $2 = daypart name, $3 = item ids to remove (cart and exclude), $4 = limit or NULL for all,
// $5 = the API key's brand id, $6 = cart item ids, $7 = customer id or NULL, $8 = item ids allowed to be returned,
// empty for any.
// One source per response: the customer's favourites when an identified customer has any left after the threshold
// and the cart, exclude and include filters; otherwise the outlet's popular items. Both are read for the requested
// daypart only, matched exactly: every run also stores an all_day list, and an unknown daypart matches nothing.
// Favourites that go with the cart come first: the brand's published item affinity run pairs some cart item with
// them. Then the other favourites, each group in stored rank order; the limit applies after this ordering. With an
// empty cart or no published affinity run no favourite is paired, so the stored order stands.
// based_on is the cart items a paired favourite goes with, strongest pair first, NULL for every other row.
// An identified customer is never served an item they rejected within the brand's rejection window, from either
// source; a window of 0 days suppresses nothing. Anonymous requests are not filtered.
// outlet_rank and outlet_list_size are the stored rank and the size of the outlet's daypart list before filtering,
// for popular items only. min_favourite_orders is NULL only when the brand has no serving config.
// Returns no rows for an unknown, inactive or deleted outlet; otherwise at least one row, with a NULL run or item
// when none matches. Another brand's outlet is served nothing.
const SERVE_RECOMMENDATIONS_SQL = `
WITH outlet AS (
  SELECT o.id, o.brand_id, o.brand_id = $5 AS in_brand
  FROM outlets o
  JOIN brands b
    ON b.id = o.brand_id
  WHERE o.id = $1
    AND o.is_active
    AND b.is_active
    AND o.deleted_at IS NULL
),
published AS (
  SELECT p.run_id
  FROM outlet o
  JOIN published_runs p
    ON p.outlet_id = o.id
   AND p.job_type = 'outlet_item_scores'
  WHERE o.in_brand
),
customer_run AS (
  SELECT p.run_id
  FROM outlet o
  JOIN brand_published_runs p
    ON p.brand_id = o.brand_id
   AND p.job_type = 'customer_item_scores'
  WHERE o.in_brand
    AND $7::text IS NOT NULL
),
affinity_run AS (
  SELECT p.run_id
  FROM outlet o
  JOIN brand_published_runs p
    ON p.brand_id = o.brand_id
   AND p.job_type = 'item_affinity'
  WHERE o.in_brand
),
serving_config AS (
  SELECT c.min_favourite_orders, c.best_seller_max_rank, c.best_seller_min_list_size, c.rejection_suppression_days
  FROM outlet o
  JOIN serving_config_versions c
    ON c.brand_id = o.brand_id
  WHERE o.in_brand
  ORDER BY c.version DESC
  LIMIT 1
),
rejected_items AS (
  SELECT r.external_item_id
  FROM outlet o
  CROSS JOIN serving_config sc
  JOIN customer_item_rejections r
    ON r.brand_id = o.brand_id
   AND r.customer_external_id = $7
   AND r.rejected_at > now() - make_interval(days => sc.rejection_suppression_days)
),
cart_pairs AS (
  SELECT a.item_b, array_agg(a.item_a ORDER BY a.confidence DESC, a.lift DESC, a.item_a) AS based_on
  FROM affinity_run ar
  JOIN item_affinity_scores a
    ON a.run_id = ar.run_id
   AND a.item_a = ANY($6)
  GROUP BY a.item_b
),
favourites AS (
  SELECT 'customer' AS source, s.rank, s.external_item_id, cp.item_b IS NOT NULL AS paired, cp.based_on,
         NULL::int AS outlet_rank, NULL::int AS outlet_list_size
  FROM customer_run cr
  JOIN customer_item_scores s
    ON s.run_id = cr.run_id
   AND s.customer_external_id = $7
   AND s.daypart = $2
  CROSS JOIN serving_config sc
  LEFT JOIN cart_pairs cp
    ON cp.item_b = s.external_item_id
  WHERE s.n_orders >= sc.min_favourite_orders
    AND s.external_item_id <> ALL($3)
    AND (cardinality($8::text[]) = 0 OR s.external_item_id = ANY($8))
    AND NOT EXISTS (SELECT 1 FROM rejected_items ri WHERE ri.external_item_id = s.external_item_id)
),
popular AS (
  SELECT 'outlet' AS source, l.rank, l.external_item_id, FALSE AS paired, NULL::text[] AS based_on,
         l.rank AS outlet_rank, l.list_size AS outlet_list_size
  FROM (
    SELECT s.rank, s.external_item_id, (count(*) OVER ())::int AS list_size
    FROM outlet o
    JOIN published p
      ON TRUE
    JOIN outlet_item_scores s
      ON s.run_id = p.run_id
     AND s.outlet_id = o.id
     AND s.daypart = $2
  ) l
  WHERE l.external_item_id <> ALL($3)
    AND (cardinality($8::text[]) = 0 OR l.external_item_id = ANY($8))
    AND NOT EXISTS (SELECT 1 FROM rejected_items ri WHERE ri.external_item_id = l.external_item_id)
),
served AS (
  SELECT source, rank, external_item_id, paired, based_on, outlet_rank, outlet_list_size
  FROM favourites
  UNION ALL
  SELECT source, rank, external_item_id, paired, based_on, outlet_rank, outlet_list_size
  FROM popular
  WHERE NOT EXISTS (SELECT 1 FROM favourites)
  ORDER BY paired DESC, rank
  LIMIT $4
)
SELECT o.in_brand, p.run_id, cr.run_id AS customer_run_id, ar.run_id AS affinity_run_id, $2::text AS daypart,
       r.external_item_id, r.source, r.based_on, r.outlet_rank, r.outlet_list_size,
       sc.min_favourite_orders, sc.best_seller_max_rank, sc.best_seller_min_list_size
FROM outlet o
LEFT JOIN published p
  ON TRUE
LEFT JOIN customer_run cr
  ON TRUE
LEFT JOIN affinity_run ar
  ON TRUE
LEFT JOIN serving_config sc
  ON TRUE
LEFT JOIN served r
  ON TRUE
ORDER BY r.paired DESC, r.rank;
`;

const NO_RECOMMENDATIONS: RecommendationResponseSchemaType = {
  recommendationId: null,
  runId: null,
  customerRunId: null,
  affinityRunId: null,
  daypart: null,
  items: [],
};

const REASON_BY_SOURCE = {
  customer: "frequently_ordered",
  outlet: "popular_at_outlet",
} as const;

interface ServedRow {
  in_brand: boolean;
  run_id: string | null;
  customer_run_id: string | null;
  affinity_run_id: string | null;
  daypart: string | null;
  external_item_id: string | null;
  source: keyof typeof REASON_BY_SOURCE | null;
  based_on: string[] | null;
  outlet_rank: number | null;
  outlet_list_size: number | null;
  min_favourite_orders: number | null;
  best_seller_max_rank: number | null;
  best_seller_min_list_size: number | null;
}

function isBestSeller(row: ServedRow): boolean {
  return (
    row.source === "outlet" &&
    row.outlet_rank !== null &&
    row.best_seller_max_rank !== null &&
    row.outlet_rank <= row.best_seller_max_rank &&
    row.outlet_list_size !== null &&
    row.best_seller_min_list_size !== null &&
    row.outlet_list_size >= row.best_seller_min_list_size
  );
}

function toDetail(row: ServedRow): RecommendationDetailSchemaType | undefined {
  if (isBestSeller(row)) {
    return { bestSeller: true };
  }
  const basedOn = row.source === "customer" ? row.based_on?.slice(0, MAX_BASED_ON) : undefined;
  return basedOn && basedOn.length > 0 ? { basedOn } : undefined;
}

function toItem(row: ServedRow, index: number): RecommendationItemSchemaType {
  const detail = toDetail(row);
  return {
    itemId: row.external_item_id as string,
    rank: index + 1,
    reason: REASON_BY_SOURCE[row.source as keyof typeof REASON_BY_SOURCE],
    ...(detail && { detail }),
  };
}

// affinityRunId is the brand's published item affinity run, which only puts favourites that go with the cart first.
// Without an outlet or customer run nothing can be served, so the response stays empty even when it exists.
function toResponse(rows: ServedRow[]): RecommendationResponseSchemaType {
  const first = rows[0];
  if (!first || (first.run_id === null && first.customer_run_id === null)) {
    return NO_RECOMMENDATIONS;
  }

  const items = rows.filter((row) => row.external_item_id !== null).map(toItem);
  return {
    recommendationId: items.length > 0 ? randomUUID() : null,
    runId: first.run_id,
    customerRunId: first.customer_run_id,
    affinityRunId: first.affinity_run_id,
    daypart: first.daypart,
    items,
  };
}

function isMissingServingConfig(first: ServedRow | undefined): boolean {
  return first?.in_brand === true && first.min_favourite_orders === null;
}

function uniqueItemIds(itemIds: string[]): string[] {
  return [...new Set(itemIds)];
}

// What the caller was served, kept for feedback (S6-04). isIdentified says whether a valid customerId was sent; the id
// itself is not kept.
export interface RecommendationServe {
  id: string;
  brandId: string;
  outletId: string;
  isIdentified: boolean;
  daypart: string;
  runId: string | null;
  customerRunId: string | null;
  affinityRunId: string | null;
  itemIds: string[];
  reasons: string[];
}

export interface ServedRecommendations {
  response: RecommendationResponseSchemaType;
  // Null when no items were returned: there is nothing to give feedback on.
  serve: RecommendationServe | null;
}

function toServe(
  brandId: string,
  outletId: string,
  isIdentified: boolean,
  response: RecommendationResponseSchemaType,
): RecommendationServe | null {
  if (response.recommendationId === null) return null;
  return {
    id: response.recommendationId,
    brandId,
    outletId,
    isIdentified,
    daypart: response.daypart as string,
    runId: response.runId,
    customerRunId: response.customerRunId,
    affinityRunId: response.affinityRunId,
    itemIds: response.items.map((item) => item.itemId),
    reasons: response.items.map((item) => item.reason),
  };
}

async function serveResponse(
  pool: Pool,
  log: Pick<FastifyBaseLogger, "error" | "warn">,
  brandId: string,
  request: RecommendationRequestSchemaType,
  customerId: string | null,
): Promise<RecommendationResponseSchemaType> {
  const cartItemIds = request.cart.map((item) => item.itemId);

  try {
    const result = await pool.query<ServedRow>(SERVE_RECOMMENDATIONS_SQL, [
      request.outletId,
      request.daypart ?? ALL_DAY_DAYPART,
      uniqueItemIds([...cartItemIds, ...(request.exclude ?? [])]),
      request.limit ?? null,
      brandId,
      uniqueItemIds(cartItemIds),
      customerId,
      uniqueItemIds(request.include ?? []),
    ]);

    if (result.rows[0]?.in_brand === false) {
      log.warn({ outletId: request.outletId }, "Outlet belongs to another brand");
    }
    if (isMissingServingConfig(result.rows[0])) {
      log.error({ outletId: request.outletId, brandId }, "Brand has no serving config");
      return NO_RECOMMENDATIONS;
    }
    return toResponse(result.rows);
  } catch (error) {
    log.error({ err: error, outletId: request.outletId }, "Recommendations failed");
    return NO_RECOMMENDATIONS;
  }
}

// A malformed request is the caller's bug and gets a 400. Anything else returns an empty list,
// so a recommendation failure never blocks the order (NF-2).
// The response does not say whether another brand's outlet exists, so a key never reveals other brands' outlets.
export async function getRecommendations(
  pool: Pool,
  log: Pick<FastifyBaseLogger, "error" | "warn">,
  brandId: string,
  request: RecommendationRequestSchemaType,
  customerIdSecret: string,
): Promise<ServedRecommendations> {
  assertValid(RecommendationRequestSchema, request);
  const customerId = toStoredCustomerId(customerIdSecret, request.customerId);

  const response = await serveResponse(pool, log, brandId, request, customerId);
  return { response, serve: toServe(brandId, request.outletId, customerId !== null, response) };
}

export async function recordRecommendationServe(
  pool: Pool,
  serve: RecommendationServe,
  channelId: string | null,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO recommendation_serves (
      id, brand_id, channel_id, outlet_id, is_identified, daypart, run_id, customer_run_id, affinity_run_id,
      item_ids, reasons
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      serve.id,
      serve.brandId,
      channelId,
      serve.outletId,
      serve.isIdentified,
      serve.daypart,
      serve.runId,
      serve.customerRunId,
      serve.affinityRunId,
      serve.itemIds,
      serve.reasons,
    ],
  );
}
