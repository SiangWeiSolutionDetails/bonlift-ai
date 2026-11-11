import {
  ALL_DAY_DAYPART,
  RecommendationDetailSchemaType,
  RecommendationItemSchemaType,
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchemaType,
} from "@bonlift-ai/contracts";
import type { FastifyBaseLogger } from "fastify";
import { Pool } from "pg";
import { ValidationError } from "../errors.js";
import { toHashedCustomerId } from "../utils/customerIdHash.js";
import { assertValid } from "../utils/validate.js";

// Below 1 in 10 the share reads as a reason not to order it ("0 in 10 who order Kopi add this").
const MIN_PAIR_SHARE = 0.1;
// Callers word the reason from the first few cart items; a big cart would otherwise list every one.
const MAX_BASED_ON = 3;

// $1 = outlet id, $2 = daypart name, $3 = item ids to remove (cart and exclude), $4 = limit or NULL for all,
// $5 = the API key's brand id, $6 = cart item ids, $7 = customer id or NULL, $8 = item ids allowed to be
// returned, empty for any. The thresholds come from the brand's latest serving config.
// Favourites and popular items are read for the requested daypart only, matched exactly: every run also stores an
// all_day list. Favourites come first and must go with the cart (RE-4.3): some cart item has them as an affinity
// partner. With an empty cart every favourite passes; with no published affinity run none does. Then items that go
// with the cart (none for an empty cart or without an affinity run), then popular items. An item in several lists
// keeps the earliest.
// Each row also carries the facts behind its reason, NULL where they do not apply: based_on (the cart items it pairs
// with, for favourites and cart partners), top_pair_confidence, top_pair_lift and top_pair_sample (the first
// based_on pair's confidence, lift and n_item_a, for cart partners), outlet_rank and outlet_list_size (the stored
// rank and the size of the outlet's daypart list before cart, exclude and include filtering, for popular items).
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
daypart AS (
  SELECT $2::text AS name
),
serving_config AS (
  SELECT c.min_favourite_orders, c.min_pair_sample, c.strong_pairing_lift, c.best_seller_max_rank,
         c.best_seller_min_list_size
  FROM outlet o
  JOIN serving_config_versions c
    ON c.brand_id = o.brand_id
  WHERE o.in_brand
  ORDER BY c.version DESC
  LIMIT 1
),
-- Affinity has no daypart, so cart partners check the name against the brand's latest daypart config instead: an
-- unknown daypart returns no items from any list.
known_daypart AS (
  SELECT 1
  FROM outlet o
  WHERE $2 = 'all_day'
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT c.dayparts
         FROM calculation_config_versions v
         JOIN outlet_item_scores_calculation_config_versions c
           ON c.id = v.id
         WHERE v.brand_id = o.brand_id
           AND v.job_type = 'outlet_item_scores'
         ORDER BY v.version DESC
         LIMIT 1
       ) latest
       WHERE latest.dayparts @> jsonb_build_array(jsonb_build_object('name', $2::text))
     )
),
-- Every affinity pair from a cart item to a recommendable item, read once for both the favourites gate and the cart
-- partners.
cart_pairs AS (
  SELECT a.item_a, a.item_b, a.confidence, a.lift, a.n_item_a
  FROM affinity_run ar
  JOIN item_affinity_scores a
    ON a.run_id = ar.run_id
   AND a.item_a = ANY($6)
  WHERE a.item_b <> ALL($3)
),
-- One row per partnered item. based_on lists its cart items strongest pair first; the top_pair_* columns are that
-- first pair's own figures.
cart_pair_items AS (
  SELECT item_b,
         sum(confidence) AS confidence_sum,
         max(lift) AS max_lift,
         array_agg(item_a ORDER BY confidence DESC, lift DESC, item_a) AS based_on,
         -- Rounded here on the exact numeric: rounding the float8 in JS turns 0.285 into 0.28.
         round((array_agg(confidence ORDER BY confidence DESC, lift DESC, item_a))[1], 2)::float8 AS top_pair_confidence,
         (array_agg(lift ORDER BY confidence DESC, lift DESC, item_a))[1]::float8 AS top_pair_lift,
         (array_agg(n_item_a ORDER BY confidence DESC, lift DESC, item_a))[1] AS top_pair_sample
  FROM cart_pairs
  GROUP BY item_b
),
-- Items bought with the whole cart (S2-01): an item partnered with several cart items sums their confidences.
-- Ties go to the higher lift, then the item id, so the order is stable.
cart_partners AS (
  SELECT i.item_b AS external_item_id,
         row_number() OVER (
           ORDER BY i.confidence_sum DESC, i.max_lift DESC, i.item_b
         ) AS rank,
         i.based_on, i.top_pair_confidence, i.top_pair_lift, i.top_pair_sample
  FROM cart_pair_items i
  CROSS JOIN known_daypart
),
candidates AS (
  SELECT 1 AS priority, 'customer' AS source, s.rank, s.external_item_id, i.based_on,
         NULL::float8 AS top_pair_confidence, NULL::float8 AS top_pair_lift, NULL::int AS top_pair_sample,
         NULL::int AS outlet_rank, NULL::int AS outlet_list_size
  FROM customer_run cr
  JOIN customer_item_scores s
    ON s.run_id = cr.run_id
   AND s.customer_external_id = $7
   AND s.daypart = $2
  CROSS JOIN serving_config sc
  LEFT JOIN cart_pair_items i
    ON i.item_b = s.external_item_id
  WHERE s.n_orders >= sc.min_favourite_orders
    AND s.external_item_id <> ALL($3)
    AND (
      cardinality($6::text[]) = 0
      OR i.item_b IS NOT NULL
    )
  UNION ALL
  SELECT 2, 'cart', cp.rank, cp.external_item_id, cp.based_on,
         cp.top_pair_confidence, cp.top_pair_lift, cp.top_pair_sample,
         NULL, NULL
  FROM cart_partners cp
  UNION ALL
  SELECT 3, 'outlet', l.rank, l.external_item_id, NULL,
         NULL, NULL, NULL,
         l.rank, l.list_size
  FROM (
    -- The list size is the stored list's, counted before cart and exclude items are removed.
    SELECT s.rank, s.external_item_id, (count(*) OVER ())::int AS list_size
    FROM outlet o
    JOIN published p
      ON TRUE
    JOIN daypart d
      ON TRUE
    JOIN outlet_item_scores s
      ON s.run_id = p.run_id
     AND s.outlet_id = o.id
     AND s.daypart = d.name
  ) l
  WHERE l.external_item_id <> ALL($3)
),
ranked AS (
  SELECT priority, source, rank, external_item_id, based_on, top_pair_confidence, top_pair_lift, top_pair_sample,
         outlet_rank, outlet_list_size
  FROM (
    SELECT DISTINCT ON (external_item_id) priority, source, rank, external_item_id, based_on, top_pair_confidence,
           top_pair_lift, top_pair_sample, outlet_rank, outlet_list_size
    FROM candidates
    WHERE cardinality($8::text[]) = 0
       OR external_item_id = ANY($8)
    ORDER BY external_item_id, priority
  ) unique_items
  ORDER BY priority, rank
  LIMIT $4
)
SELECT o.in_brand, p.run_id, cr.run_id AS customer_run_id, ar.run_id AS affinity_run_id, d.name AS daypart,
       r.external_item_id, r.source, r.based_on, r.top_pair_confidence, r.top_pair_lift, r.top_pair_sample,
       r.outlet_rank, r.outlet_list_size, sc.min_pair_sample, sc.strong_pairing_lift::float8 AS strong_pairing_lift,
       sc.best_seller_max_rank, sc.best_seller_min_list_size
FROM outlet o
LEFT JOIN published p
  ON TRUE
LEFT JOIN customer_run cr
  ON TRUE
LEFT JOIN affinity_run ar
  ON TRUE
LEFT JOIN daypart d
  ON TRUE
LEFT JOIN serving_config sc
  ON TRUE
LEFT JOIN ranked r
  ON TRUE
ORDER BY r.priority, r.rank;
`;

const NO_RECOMMENDATIONS: RecommendationResponseSchemaType = {
  runId: null,
  customerRunId: null,
  affinityRunId: null,
  daypart: null,
  items: [],
};

const REASON_BY_SOURCE = {
  customer: "frequently_ordered",
  cart: "goes_with_cart",
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
  top_pair_confidence: number | null;
  top_pair_lift: number | null;
  top_pair_sample: number | null;
  outlet_rank: number | null;
  outlet_list_size: number | null;
  min_pair_sample: number | null;
  strong_pairing_lift: number | null;
  best_seller_max_rank: number | null;
  best_seller_min_list_size: number | null;
}

function toBasedOn(row: ServedRow): RecommendationDetailSchemaType {
  return row.based_on !== null && row.based_on.length > 0 ? { basedOn: row.based_on.slice(0, MAX_BASED_ON) } : {};
}

function hasPairSample(row: ServedRow): boolean {
  return row.source === "cart" && row.top_pair_sample !== null && row.min_pair_sample !== null &&
    row.top_pair_sample >= row.min_pair_sample;
}

function toPairing(row: ServedRow): RecommendationDetailSchemaType {
  if (!hasPairSample(row) || row.top_pair_confidence === null) {
    return {};
  }
  const share = row.top_pair_confidence >= MIN_PAIR_SHARE ? { pairShare: row.top_pair_confidence } : {};
  return row.top_pair_lift !== null &&
    row.strong_pairing_lift !== null &&
    row.top_pair_lift >= row.strong_pairing_lift
    ? { ...share, strongPairing: true }
    : share;
}

function toBestSeller(row: ServedRow): RecommendationDetailSchemaType {
  const isBestSeller =
    row.source === "outlet" &&
    row.outlet_rank !== null &&
    row.best_seller_max_rank !== null &&
    row.outlet_rank <= row.best_seller_max_rank &&
    row.outlet_list_size !== null &&
    row.best_seller_min_list_size !== null &&
    row.outlet_list_size >= row.best_seller_min_list_size;
  return isBestSeller ? { bestSeller: true } : {};
}

function toDetail(row: ServedRow): RecommendationDetailSchemaType | undefined {
  const detail = { ...toBasedOn(row), ...toPairing(row), ...toBestSeller(row) };
  return Object.keys(detail).length > 0 ? detail : undefined;
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

function toResponse(rows: ServedRow[]): RecommendationResponseSchemaType {
  const first = rows[0];
  if (
    !first ||
    (first.run_id === null && first.customer_run_id === null && first.affinity_run_id === null)
  ) {
    return NO_RECOMMENDATIONS;
  }

  return {
    runId: first.run_id,
    customerRunId: first.customer_run_id,
    affinityRunId: first.affinity_run_id,
    daypart: first.daypart,
    items: rows
      .filter((row) => row.external_item_id !== null)
      .map(toItem),
  };
}

function isMissingServingConfig(first: ServedRow | undefined): boolean {
  return first?.in_brand === true && first.min_pair_sample === null;
}

function uniqueItemIds(itemIds: string[]): string[] {
  return [...new Set(itemIds)];
}

// Stored ids are hashed (CUS-02), so the request's id is hashed the same way before the lookup. A malformed id is the
// caller's bug: a 400, never a silent anonymous request. The id itself is never put in the error or a log.
function toStoredCustomerId(secret: string, customerId: string | null | undefined): string | null {
  const customer = toHashedCustomerId(secret, customerId);
  if (customer.status === "invalid") {
    throw new ValidationError(
      'customerId must be a mobile number with its country dial code and no "+" (8 to 15 digits), or an email address.',
    );
  }
  return customer.status === "hashed" ? customer.id : null;
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
): Promise<RecommendationResponseSchemaType> {
  assertValid(RecommendationRequestSchema, request);
  const customerId = toStoredCustomerId(customerIdSecret, request.customerId);

  const cartItemIds = uniqueItemIds(request.cart.map((item) => item.itemId));

  try {
    const result = await pool.query<ServedRow>(SERVE_RECOMMENDATIONS_SQL, [
      request.outletId,
      request.daypart ?? ALL_DAY_DAYPART,
      uniqueItemIds([...cartItemIds, ...(request.exclude ?? [])]),
      request.limit ?? null,
      brandId,
      cartItemIds,
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
