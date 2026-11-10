import {
  ALL_DAY_DAYPART,
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchemaType,
} from "@bonlift-ai/contracts";
import type { FastifyBaseLogger } from "fastify";
import { Pool } from "pg";
import { ValidationError } from "../errors.js";
import { toHashedCustomerId } from "../utils/customerIdHash.js";
import { assertValid } from "../utils/validate.js";

// A favourite from a single order is weak evidence: every item of a customer's only order scores 1.
const MIN_FAVOURITE_ORDERS = 2;

// $1 = outlet id, $2 = daypart name, $3 = item ids to remove (cart and exclude), $4 = limit or NULL for all,
// $5 = the API key's brand id, $6 = cart item ids, $7 = customer id or NULL, $8 = minimum orders behind a favourite,
// $9 = item ids allowed to be returned, empty for any.
// Favourites and popular items are read for the requested daypart only, matched exactly: every run also stores an
// all_day list. Favourites come first and must go with the cart (RE-4.3): some cart item has them as an affinity
// partner. With an empty cart every favourite passes; with no published affinity run none does. Then items that go
// with the cart (none for an empty cart or without an affinity run), then popular items. An item in several lists
// keeps the earliest.
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
-- Items bought with the whole cart (S2-01): an item partnered with several cart items sums their confidences.
-- Ties go to the higher lift, then the item id, so the order is stable.
cart_partners AS (
  SELECT a.item_b AS external_item_id,
         row_number() OVER (
           ORDER BY sum(a.confidence) DESC, max(a.lift) DESC, a.item_b
         ) AS rank
  FROM affinity_run ar
  CROSS JOIN known_daypart
  JOIN item_affinity_scores a
    ON a.run_id = ar.run_id
   AND a.item_a = ANY($6)
  WHERE a.item_b <> ALL($3)
  GROUP BY a.item_b
),
candidates AS (
  SELECT 1 AS priority, 'customer' AS source, s.rank, s.external_item_id
  FROM customer_run cr
  JOIN customer_item_scores s
    ON s.run_id = cr.run_id
   AND s.customer_external_id = $7
   AND s.daypart = $2
  WHERE s.n_orders >= $8
    AND s.external_item_id <> ALL($3)
    AND (
      cardinality($6::text[]) = 0
      OR EXISTS (
        SELECT 1
        FROM affinity_run ar
        JOIN item_affinity_scores a
          ON a.run_id = ar.run_id
         AND a.item_a = ANY($6)
         AND a.item_b = s.external_item_id
      )
    )
  UNION ALL
  SELECT 2, 'cart', cp.rank, cp.external_item_id
  FROM cart_partners cp
  UNION ALL
  SELECT 3, 'outlet', s.rank, s.external_item_id
  FROM outlet o
  JOIN published p
    ON TRUE
  JOIN daypart d
    ON TRUE
  JOIN outlet_item_scores s
    ON s.run_id = p.run_id
   AND s.outlet_id = o.id
   AND s.daypart = d.name
  WHERE s.external_item_id <> ALL($3)
),
ranked AS (
  SELECT priority, source, rank, external_item_id
  FROM (
    SELECT DISTINCT ON (external_item_id) priority, source, rank, external_item_id
    FROM candidates
    WHERE cardinality($9::text[]) = 0
       OR external_item_id = ANY($9)
    ORDER BY external_item_id, priority
  ) unique_items
  ORDER BY priority, rank
  LIMIT $4
)
SELECT o.in_brand, p.run_id, cr.run_id AS customer_run_id, ar.run_id AS affinity_run_id, d.name AS daypart,
       r.external_item_id, r.source
FROM outlet o
LEFT JOIN published p
  ON TRUE
LEFT JOIN customer_run cr
  ON TRUE
LEFT JOIN affinity_run ar
  ON TRUE
LEFT JOIN daypart d
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
      .map((row, index) => ({
        itemId: row.external_item_id as string,
        rank: index + 1,
        reason: REASON_BY_SOURCE[row.source as keyof typeof REASON_BY_SOURCE],
      })),
  };
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
      MIN_FAVOURITE_ORDERS,
      uniqueItemIds(request.include ?? []),
    ]);

    if (result.rows[0]?.in_brand === false) {
      log.warn({ outletId: request.outletId }, "Outlet belongs to another brand");
    }
    return toResponse(result.rows);
  } catch (error) {
    log.error({ err: error, outletId: request.outletId }, "Recommendations failed");
    return NO_RECOMMENDATIONS;
  }
}
