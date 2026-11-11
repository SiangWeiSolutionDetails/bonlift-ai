import {
  ALL_DAY_DAYPART,
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

// $1 = outlet id, $2 = daypart name, $3 = item ids to remove (cart and exclude), $4 = limit or NULL for all,
// $5 = the API key's brand id, $6 = customer id or NULL, $7 = item ids allowed to be returned, empty for any.
// One source per response: the customer's favourites when an identified customer has any left after the threshold
// and the cart, exclude and include filters; otherwise the outlet's popular items. Both are read for the requested
// daypart only, matched exactly: every run also stores an all_day list, and an unknown daypart matches nothing.
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
    AND $6::text IS NOT NULL
),
serving_config AS (
  SELECT c.min_favourite_orders, c.best_seller_max_rank, c.best_seller_min_list_size
  FROM outlet o
  JOIN serving_config_versions c
    ON c.brand_id = o.brand_id
  WHERE o.in_brand
  ORDER BY c.version DESC
  LIMIT 1
),
favourites AS (
  SELECT 'customer' AS source, s.rank, s.external_item_id, NULL::int AS outlet_rank, NULL::int AS outlet_list_size
  FROM customer_run cr
  JOIN customer_item_scores s
    ON s.run_id = cr.run_id
   AND s.customer_external_id = $6
   AND s.daypart = $2
  CROSS JOIN serving_config sc
  WHERE s.n_orders >= sc.min_favourite_orders
    AND s.external_item_id <> ALL($3)
    AND (cardinality($7::text[]) = 0 OR s.external_item_id = ANY($7))
),
popular AS (
  SELECT 'outlet' AS source, l.rank, l.external_item_id, l.rank AS outlet_rank, l.list_size AS outlet_list_size
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
    AND (cardinality($7::text[]) = 0 OR l.external_item_id = ANY($7))
),
served AS (
  SELECT source, rank, external_item_id, outlet_rank, outlet_list_size
  FROM favourites
  UNION ALL
  SELECT source, rank, external_item_id, outlet_rank, outlet_list_size
  FROM popular
  WHERE NOT EXISTS (SELECT 1 FROM favourites)
  ORDER BY rank
  LIMIT $4
)
SELECT o.in_brand, p.run_id, cr.run_id AS customer_run_id, $2::text AS daypart,
       r.external_item_id, r.source, r.outlet_rank, r.outlet_list_size,
       sc.min_favourite_orders, sc.best_seller_max_rank, sc.best_seller_min_list_size
FROM outlet o
LEFT JOIN published p
  ON TRUE
LEFT JOIN customer_run cr
  ON TRUE
LEFT JOIN serving_config sc
  ON TRUE
LEFT JOIN served r
  ON TRUE
ORDER BY r.rank;
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
  outlet: "popular_at_outlet",
} as const;

interface ServedRow {
  in_brand: boolean;
  run_id: string | null;
  customer_run_id: string | null;
  daypart: string | null;
  external_item_id: string | null;
  source: keyof typeof REASON_BY_SOURCE | null;
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

function toItem(row: ServedRow, index: number): RecommendationItemSchemaType {
  return {
    itemId: row.external_item_id as string,
    rank: index + 1,
    reason: REASON_BY_SOURCE[row.source as keyof typeof REASON_BY_SOURCE],
    ...(isBestSeller(row) && { detail: { bestSeller: true } }),
  };
}

// Item affinity is not served here, so affinityRunId is always null; the field stays for /v1 compatibility.
function toResponse(rows: ServedRow[]): RecommendationResponseSchemaType {
  const first = rows[0];
  if (!first || (first.run_id === null && first.customer_run_id === null)) {
    return NO_RECOMMENDATIONS;
  }

  return {
    runId: first.run_id,
    customerRunId: first.customer_run_id,
    affinityRunId: null,
    daypart: first.daypart,
    items: rows
      .filter((row) => row.external_item_id !== null)
      .map(toItem),
  };
}

function isMissingServingConfig(first: ServedRow | undefined): boolean {
  return first?.in_brand === true && first.min_favourite_orders === null;
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

  const cartItemIds = request.cart.map((item) => item.itemId);

  try {
    const result = await pool.query<ServedRow>(SERVE_RECOMMENDATIONS_SQL, [
      request.outletId,
      request.daypart ?? ALL_DAY_DAYPART,
      uniqueItemIds([...cartItemIds, ...(request.exclude ?? [])]),
      request.limit ?? null,
      brandId,
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
