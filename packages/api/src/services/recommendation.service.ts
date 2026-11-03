import {
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchemaType,
} from "@ai-services/contracts";
import type { FastifyBaseLogger } from "fastify";
import { Pool } from "pg";
import { assertValid } from "../utils/validate.js";

const DEFAULT_LIMIT = 10;

// $1 = outlet id, $2 = local time with offset, $3 = cart item ids, $4 = limit, $5 = the API key's brand id.
// The daypart comes from the published run's own config version, not the latest one, so its names match the stored
// rows. "::timestamp" ignores the offset, so the local hour is read as written (D-T10), as the worker reads orderedAt.
// Returns no rows for an unknown or inactive outlet; otherwise at least one row, with a NULL run, daypart or item
// when none matches. Another brand's outlet is served nothing.
const SERVE_OUTLET_ITEM_SCORES_SQL = `
WITH outlet AS (
  SELECT o.id, o.brand_id = $5 AS in_brand
  FROM outlets o
  JOIN brands b
    ON b.id = o.brand_id
  WHERE o.id = $1
    AND o.is_active
    AND b.is_active
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
)
SELECT o.in_brand, p.run_id, d.name AS daypart, s.external_item_id
FROM outlet o
LEFT JOIN published p
  ON TRUE
LEFT JOIN daypart d
  ON TRUE
LEFT JOIN outlet_item_scores s
  ON s.run_id = p.run_id
 AND s.outlet_id = o.id
 AND s.daypart = d.name
 AND s.external_item_id <> ALL($3)
ORDER BY s.rank
LIMIT $4;
`;

const NO_RECOMMENDATIONS: RecommendationResponseSchemaType = {
  runId: null,
  daypart: null,
  items: [],
};

interface ServedRow {
  in_brand: boolean;
  run_id: string | null;
  daypart: string | null;
  external_item_id: string | null;
}

function toResponse(rows: ServedRow[]): RecommendationResponseSchemaType {
  if (rows.length === 0 || rows[0].run_id === null) return NO_RECOMMENDATIONS;

  return {
    runId: rows[0].run_id,
    daypart: rows[0].daypart,
    items: rows
      .filter((row) => row.external_item_id !== null)
      .map((row, index) => ({
        itemId: row.external_item_id as string,
        rank: index + 1,
        reason: "popular_at_outlet" as const,
      })),
  };
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

  const cartItemIds = [...new Set(request.cart.map((item) => item.itemId))];

  try {
    const result = await pool.query<ServedRow>(SERVE_OUTLET_ITEM_SCORES_SQL, [
      request.outletId,
      request.at,
      cartItemIds,
      request.limit ?? DEFAULT_LIMIT,
      brandId,
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
