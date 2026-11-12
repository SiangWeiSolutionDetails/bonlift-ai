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
// Personal items for an identified customer: their favourites, then related items, which the brand's published item
// affinity run says are often ordered with a favourite but are not favourites themselves. Popular items at the outlet
// are served only when no personal item is left after the threshold and the cart, exclude and include filters. All
// are read for the requested daypart only, matched exactly: every run also stores an all_day list, and an unknown
// daypart matches nothing. A favourite in the cart, excluded or rejected still finds related items.
// Within each group, items shown to the customer within the brand's repeat cooldown go after the ones not shown;
// accepting an item forgets that it was shown, and a cooldown of 0 hours moves nothing. A showing only counts once the
// brand's feedback window has closed, so items shown during a visit keep their place and the list stays stable.
// Then favourites that go with the cart (the affinity run pairs some cart item with them), then stored rank. Related items follow their strongest
// pair, by confidence then lift. With a limit of 2 or more and any related item, favourites fill at most limit - 1
// slots and related items the rest; with a limit of 1 a favourite wins.
// based_on is the cart items a paired favourite goes with, or the favourites a related item goes with, strongest pair
// first, NULL for every other row.
// An identified customer is never served an item they rejected within the brand's rejection window, from any source;
// a window of 0 days suppresses nothing. Anonymous requests are neither filtered nor rotated.
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
  SELECT c.min_favourite_orders, c.best_seller_max_rank, c.best_seller_min_list_size, c.rejection_suppression_days,
         c.repeat_cooldown_hours, c.feedback_window_minutes
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
recent_exposures AS (
  SELECT e.external_item_id
  FROM outlet o
  CROSS JOIN serving_config sc
  JOIN customer_item_exposures e
    ON e.brand_id = o.brand_id
   AND e.customer_external_id = $7
   AND e.last_shown_at > now() - make_interval(hours => sc.repeat_cooldown_hours)
   AND e.last_shown_at <= now() - make_interval(mins => sc.feedback_window_minutes)
),
cart_pairs AS (
  SELECT a.item_b, array_agg(a.item_a ORDER BY a.confidence DESC, a.lift DESC, a.item_a) AS based_on
  FROM affinity_run ar
  JOIN item_affinity_scores a
    ON a.run_id = ar.run_id
   AND a.item_a = ANY($6)
  GROUP BY a.item_b
),
-- Before the cart, exclude, include and rejection filters: these anchor related items and are never related themselves.
customer_favourites AS (
  SELECT s.rank, s.external_item_id
  FROM customer_run cr
  JOIN customer_item_scores s
    ON s.run_id = cr.run_id
   AND s.customer_external_id = $7
   AND s.daypart = $2
  CROSS JOIN serving_config sc
  WHERE s.n_orders >= sc.min_favourite_orders
),
favourites AS (
  SELECT 'customer' AS source, f.rank, f.external_item_id, cp.item_b IS NOT NULL AS paired, cp.based_on,
         EXISTS (SELECT 1 FROM recent_exposures re WHERE re.external_item_id = f.external_item_id) AS recently_shown,
         NULL::int AS outlet_rank, NULL::int AS outlet_list_size
  FROM customer_favourites f
  LEFT JOIN cart_pairs cp
    ON cp.item_b = f.external_item_id
  WHERE f.external_item_id <> ALL($3)
    AND (cardinality($8::text[]) = 0 OR f.external_item_id = ANY($8))
    AND NOT EXISTS (SELECT 1 FROM rejected_items ri WHERE ri.external_item_id = f.external_item_id)
),
related AS (
  SELECT 'related' AS source,
         (row_number() OVER (ORDER BY max(a.confidence) DESC, max(a.lift) DESC, a.item_b))::int AS rank,
         a.item_b AS external_item_id, FALSE AS paired,
         array_agg(a.item_a ORDER BY a.confidence DESC, a.lift DESC, a.item_a) AS based_on,
         EXISTS (SELECT 1 FROM recent_exposures re WHERE re.external_item_id = a.item_b) AS recently_shown,
         NULL::int AS outlet_rank, NULL::int AS outlet_list_size
  FROM affinity_run ar
  JOIN item_affinity_scores a
    ON a.run_id = ar.run_id
  JOIN customer_favourites f
    ON f.external_item_id = a.item_a
  WHERE NOT EXISTS (SELECT 1 FROM customer_favourites cf WHERE cf.external_item_id = a.item_b)
    AND a.item_b <> ALL($3)
    AND (cardinality($8::text[]) = 0 OR a.item_b = ANY($8))
    AND NOT EXISTS (SELECT 1 FROM rejected_items ri WHERE ri.external_item_id = a.item_b)
  GROUP BY a.item_b
),
popular AS (
  SELECT 'outlet' AS source, l.rank, l.external_item_id, FALSE AS paired, NULL::text[] AS based_on,
         EXISTS (SELECT 1 FROM recent_exposures re WHERE re.external_item_id = l.external_item_id) AS recently_shown,
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
personal AS (
  SELECT p.*,
         row_number() OVER (PARTITION BY p.source ORDER BY p.recently_shown, p.paired DESC, p.rank) AS tier_position,
         count(*) FILTER (WHERE p.source = 'customer') OVER () AS favourite_count,
         count(*) FILTER (WHERE p.source = 'related') OVER () AS related_count
  FROM (
    SELECT source, rank, external_item_id, paired, based_on, recently_shown, outlet_rank, outlet_list_size
    FROM favourites
    UNION ALL
    SELECT source, rank, external_item_id, paired, based_on, recently_shown, outlet_rank, outlet_list_size
    FROM related
  ) p
),
-- One slot is kept for a related item when the limit allows two or more.
slotted AS (
  SELECT ps.*,
         CASE
           WHEN $4::int IS NULL THEN ps.favourite_count
           WHEN ps.related_count > 0 AND $4 >= 2 THEN least(ps.favourite_count, $4 - 1)
           ELSE least(ps.favourite_count, $4)
         END AS favourite_slots
  FROM personal ps
),
candidates AS (
  SELECT source, external_item_id, based_on, outlet_rank, outlet_list_size,
         CASE source WHEN 'customer' THEN 0 ELSE 1 END AS tier, tier_position
  FROM slotted
  WHERE (source = 'customer' AND tier_position <= favourite_slots)
     OR (source = 'related' AND ($4 IS NULL OR tier_position <= $4 - favourite_slots))
  UNION ALL
  SELECT source, external_item_id, based_on, outlet_rank, outlet_list_size,
         2 AS tier, row_number() OVER (ORDER BY recently_shown, rank) AS tier_position
  FROM popular
  WHERE NOT EXISTS (SELECT 1 FROM personal)
),
served AS (
  SELECT source, external_item_id, based_on, outlet_rank, outlet_list_size,
         row_number() OVER (ORDER BY tier, tier_position) AS position
  FROM candidates
  ORDER BY position
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
ORDER BY r.position;
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
  related: "related_to_favourite",
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
  const basedOn = row.source === "outlet" ? undefined : row.based_on?.slice(0, MAX_BASED_ON);
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

// affinityRunId is the brand's published item affinity run, which puts favourites that go with the cart first and
// finds related items.
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

// What an identified customer was served, kept for feedback (S6-04). The hashed customer id only records which items
// the customer was shown, for rotation: recommendation_serves keeps no customer id.
export interface RecommendationServe {
  id: string;
  brandId: string;
  storedCustomerId: string;
  outletId: string;
  daypart: string;
  runId: string | null;
  customerRunId: string | null;
  affinityRunId: string | null;
  itemIds: string[];
  reasons: string[];
}

export interface ServedRecommendations {
  response: RecommendationResponseSchemaType;
  // Null when no items were returned or the customer is anonymous: there is nothing to give feedback on.
  serve: RecommendationServe | null;
}

function toServe(
  brandId: string,
  outletId: string,
  storedCustomerId: string | null,
  response: RecommendationResponseSchemaType,
): RecommendationServe | null {
  if (response.recommendationId === null || storedCustomerId === null) return null;
  return {
    id: response.recommendationId,
    brandId,
    storedCustomerId,
    outletId,
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

  const served = await serveResponse(pool, log, brandId, request, customerId);
  // Only identified customers can give feedback, so an anonymous response is neither identified nor recorded.
  const response = customerId === null ? { ...served, recommendationId: null } : served;
  return { response, serve: toServe(brandId, request.outletId, customerId, response) };
}

// Records the serve and, in the same statement, when the customer was last shown each served item.
const RECORD_SERVE_SQL = `
WITH serve AS (
  INSERT INTO recommendation_serves (
    id, brand_id, channel_id, outlet_id, daypart, run_id, customer_run_id, affinity_run_id, item_ids, reasons
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  RETURNING brand_id, item_ids
)
INSERT INTO customer_item_exposures (brand_id, customer_external_id, external_item_id, last_shown_at)
SELECT DISTINCT s.brand_id, $11::text, i.item_id, now()
FROM serve s
CROSS JOIN unnest(s.item_ids) AS i(item_id)
ON CONFLICT (brand_id, customer_external_id, external_item_id)
DO UPDATE SET last_shown_at = EXCLUDED.last_shown_at;
`;

export async function recordRecommendationServe(
  pool: Pool,
  serve: RecommendationServe,
  channelId: string | null,
): Promise<void> {
  await pool.query(RECORD_SERVE_SQL, [
    serve.id,
    serve.brandId,
    channelId,
    serve.outletId,
    serve.daypart,
    serve.runId,
    serve.customerRunId,
    serve.affinityRunId,
    serve.itemIds,
    serve.reasons,
    serve.storedCustomerId,
  ]);
}
