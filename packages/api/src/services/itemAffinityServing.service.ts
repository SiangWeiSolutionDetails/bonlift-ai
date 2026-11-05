import {
  ItemAffinityRequestSchema,
  ItemAffinityRequestSchemaType,
  ItemAffinityResponseSchemaType,
} from "@ai-services/contracts";
import type { FastifyBaseLogger } from "fastify";
import { Pool } from "pg";
import { assertValid } from "../utils/validate.js";

// $1 = the API key's brand id, $2 = cart item ids, $3 = item ids to remove (cart and exclude), $4 = item ids allowed to
// be returned, empty for any, $5 = limit or NULL for all.
// A partner of several cart items is returned once, ranked by its best confidence, then lift; item id keeps ties stable.
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
partners AS (
  SELECT s.item_b, MAX(s.confidence) AS confidence, MAX(s.lift) AS lift
  FROM affinity_run ar
  JOIN item_affinity_scores s
    ON s.run_id = ar.run_id
   AND s.item_a = ANY($2::text[])
  WHERE s.item_b <> ALL($3::text[])
    AND (cardinality($4::text[]) = 0 OR s.item_b = ANY($4::text[]))
  GROUP BY s.item_b
  ORDER BY confidence DESC, lift DESC, s.item_b
  LIMIT $5
)
SELECT ar.run_id, p.item_b AS external_item_id
FROM affinity_run ar
LEFT JOIN partners p
  ON TRUE
ORDER BY p.confidence DESC, p.lift DESC, p.item_b;
`;

const NO_ITEMS: ItemAffinityResponseSchemaType = { runId: null, items: [] };

interface ServedRow {
  run_id: string;
  external_item_id: string | null;
}

function toResponse(rows: ServedRow[]): ItemAffinityResponseSchemaType {
  const first = rows[0];
  if (!first) {
    return NO_ITEMS;
  }

  return {
    runId: first.run_id,
    items: rows
      .filter((row) => row.external_item_id !== null)
      .map((row, index) => ({
        itemId: row.external_item_id as string,
        rank: index + 1,
        reason: "goes_with_cart",
      })),
  };
}

function uniqueItemIds(itemIds: string[]): string[] {
  return [...new Set(itemIds)];
}

// A malformed request gets a 400; anything else returns an empty list so the order is never blocked (NF-2).
export async function getItemAffinityRecommendations(
  pool: Pool,
  log: Pick<FastifyBaseLogger, "error">,
  brandId: string,
  request: ItemAffinityRequestSchemaType,
): Promise<ItemAffinityResponseSchemaType> {
  assertValid(ItemAffinityRequestSchema, request);

  const cartItemIds = uniqueItemIds(request.cart.map((item) => item.itemId));

  try {
    const result = await pool.query<ServedRow>(SERVE_ITEM_AFFINITY_SQL, [
      brandId,
      cartItemIds,
      uniqueItemIds([...cartItemIds, ...(request.exclude ?? [])]),
      uniqueItemIds(request.include ?? []),
      request.limit ?? null,
    ]);
    return toResponse(result.rows);
  } catch (error) {
    log.error({ err: error, brandId }, "Item affinity recommendations failed");
    return NO_ITEMS;
  }
}
