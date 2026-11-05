import {
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchemaType,
} from "@ai-services/contracts";
import type { FastifyBaseLogger } from "fastify";
import { Pool } from "pg";
import { assertValid } from "../utils/validate.js";

const DEFAULT_LIMIT = 10;
// A favourite from a single order is weak evidence: every item of a customer's only order scores 1.
const MIN_FAVOURITE_ORDERS = 2;

// $1 = outlet id, $2 = local time with offset, $3 = item ids to remove (cart and exclude), $4 = limit,
// $5 = the API key's brand id, $6 = cart item ids, $7 = customer id or NULL, $8 = minimum orders behind a favourite.
// The daypart comes from the published run's own config version, not the latest one, so its names match the stored
// rows. "::timestamp" ignores the offset, so the local hour is read as written (D-T10), as the worker reads orderedAt.
// Favourites come first and must go with the cart (RE-4.3): some cart item has them as an affinity partner. With an
// empty cart every favourite passes; with no published affinity run none does. An item in both lists is a favourite.
// Returns no rows for an unknown, inactive or deleted outlet; otherwise at least one row, with a NULL run, daypart or item
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
  SELECT p.run_id, c.dayparts
  FROM outlet o
  JOIN published_runs p
    ON p.outlet_id = o.id
   AND p.job_type = 'outlet_item_scores'
  JOIN computation_runs r
    ON r.id = p.run_id
  JOIN outlet_item_scores_calculation_config_versions c
    ON c.id = r.calculation_config_version_id
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
local_time AS (
  SELECT $2::timestamp::time AS t
),
-- No dayparts configured: the run stored one all_day list (P3-D6). A daypart with start > end crosses midnight.
daypart AS (
  SELECT name
  FROM (
    SELECT d.name
    FROM published
    CROSS JOIN local_time lt
    CROSS JOIN LATERAL jsonb_to_recordset(published.dayparts) AS d(name text, start time, "end" time)
    WHERE CASE WHEN d.start < d."end"
               THEN lt.t >= d.start AND lt.t < d."end"
               ELSE lt.t >= d.start OR  lt.t < d."end"
          END
    UNION ALL
    SELECT 'all_day'
    FROM published
    WHERE jsonb_array_length(published.dayparts) = 0
  ) matched
  LIMIT 1
),
candidates AS (
  SELECT 1 AS priority, 'customer' AS source, s.rank, s.external_item_id
  FROM customer_run cr
  JOIN customer_item_scores s
    ON s.run_id = cr.run_id
   AND s.customer_external_id = $7
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
  SELECT 2, 'outlet', s.rank, s.external_item_id
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
    ORDER BY external_item_id, priority
  ) unique_items
  ORDER BY priority, rank
  LIMIT $4
)
SELECT o.in_brand, p.run_id, cr.run_id AS customer_run_id, d.name AS daypart, r.external_item_id, r.source
FROM outlet o
LEFT JOIN published p
  ON TRUE
LEFT JOIN customer_run cr
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
}

function toResponse(rows: ServedRow[]): RecommendationResponseSchemaType {
  const first = rows[0];
  if (!first || (first.run_id === null && first.customer_run_id === null)) {
    return NO_RECOMMENDATIONS;
  }

  return {
    runId: first.run_id,
    customerRunId: first.customer_run_id,
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

// Trims the same characters as the customer item scores calculation, so " C1" finds the scores stored for "C1".
function toCustomerId(customerId: string | null | undefined): string | null {
  const trimmed = customerId?.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  return trimmed ? trimmed : null;
}

// A malformed request is the caller's bug and gets a 400. Anything else returns an empty list,
// so a recommendation failure never blocks the order (NF-2).
// The response does not say whether another brand's outlet exists, so a key never reveals other brands' outlets.
export async function getRecommendations(
  pool: Pool,
  log: Pick<FastifyBaseLogger, "error" | "warn">,
  brandId: string,
  request: RecommendationRequestSchemaType,
): Promise<RecommendationResponseSchemaType> {
  assertValid(RecommendationRequestSchema, request);

  const cartItemIds = uniqueItemIds(request.cart.map((item) => item.itemId));

  try {
    const result = await pool.query<ServedRow>(SERVE_RECOMMENDATIONS_SQL, [
      request.outletId,
      request.at,
      uniqueItemIds([...cartItemIds, ...(request.exclude ?? [])]),
      request.limit ?? DEFAULT_LIMIT,
      brandId,
      cartItemIds,
      toCustomerId(request.customerId),
      MIN_FAVOURITE_ORDERS,
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
