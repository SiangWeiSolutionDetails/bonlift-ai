import {
  BrandParamsSchema,
  FeedbackCountsSchemaType,
  RecommendationFeedbackBreakdownRowSchemaType,
  RecommendationFeedbackDaySchemaType,
  RecommendationFeedbackReportQuerySchema,
  RecommendationFeedbackReportQuerySchemaType,
  RecommendationFeedbackReportSchemaType,
  RecommendationFeedbackRunRowSchemaType,
  FeedbackRunJobTypeSchemaType,
  RecommendationServeLogEntrySchemaType,
  RecommendationServesQuerySchema,
  RecommendationServesQuerySchemaType,
  RecommendationServesSchemaType,
  ServedItemOutcomeSchemaType,
} from "@bonlift-ai/contracts";
import { Pool } from "pg";
import { NotFoundError, ValidationError } from "../errors.js";
import { assertValid } from "../utils/validate.js";
import { assertValidTimeZone } from "./brandUsage.service.js";

const DEFAULT_SERVES_LIMIT = 50;
// days holds one row per date, so the range is capped to keep a typo like year 9999 from building millions of rows.
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

// $1 = brand id, $2 and $3 = inclusive dates in time zone $4, as in the usage report. No brand → no bounds row → no
// result row, which tells "unknown brand" apart from "no serves" in one round trip.
const BOUNDS_SQL = `
  bounds AS (
    SELECT b.id AS brand_id,
           $2::date::timestamp AT TIME ZONE $4 AS from_at,
           ($3::date + 1)::timestamp AT TIME ZONE $4 AS to_at
    FROM brands b
    WHERE b.id = $1
      AND b.deleted_at IS NULL
  )`;

const SERVES_IN_RANGE_SQL = `
  FROM bounds
  JOIN recommendation_serves s
    ON s.brand_id = bounds.brand_id
   AND s.served_at >= bounds.from_at
   AND s.served_at < bounds.to_at`;

// $5 = outlet id, $6 = daypart, $8 = channel id; NULL means no filter. The reason ($7) and run ($9) filters differ
// per query.
const SERVE_FILTERS_SQL = `
  WHERE ($5::uuid IS NULL OR s.outlet_id = $5)
    AND ($6::text IS NULL OR s.daypart = $6)
    AND ($8::uuid IS NULL OR s.channel_id = $8)`;

// Feedback stored on served item i of serve s, NULL when there is none. An item in both arrays counts as accepted.
const ITEM_OUTCOME_SQL = `
  CASE
    WHEN i.item_id = ANY(s.accepted_item_ids) THEN 'accepted'
    WHEN i.item_id = ANY(s.rejected_item_ids) THEN 'rejected'
  END`;

// The run a served item of the given reason came from, NULL for a reason no scoring run feeds. Affinity runs only
// order favourites, so no item comes from them.
function runSourceSql(reason: string) {
  return `CASE ${reason}
    WHEN 'popular_at_outlet' THEN s.run_id
    WHEN 'frequently_ordered' THEN s.customer_run_id
  END`;
}

function runJobTypeSql(reason: string) {
  return `CASE ${reason}
    WHEN 'popular_at_outlet' THEN 'outlet_item_scores'
    WHEN 'frequently_ordered' THEN 'customer_item_scores'
  END`;
}

// One aggregation over the stored feedback yields the summary, days and every breakdown. Only the feedback arrays are
// unnested, so serves and items without feedback add no rows and every breakdown row has feedback. A rejected item that
// was later accepted is skipped in the rejected branch. Each item's reason is read from reasons at the item's position
// in item_ids (feedback is only stored for served items). GROUPING(...) is a bitmask with a bit set for each listed
// column the row is NOT grouped by (day is the highest bit), so it names the row's set. Items without a source run
// form a NULL run group, dropped by HAVING. Runs are joined after grouping, once per run row; serves have no foreign
// key to runs, so a run deleted by retention joins nothing. runAt is the run's finish (its start if it never
// finished): publishing keeps only the current run per scope, so no publish time survives for older runs.
const FEEDBACK_REPORT_SQL = `
  WITH ${BOUNDS_SQL},
  feedback AS (
    SELECT (s.served_at AT TIME ZONE $4)::date::text AS day,
           s.outlet_id,
           s.daypart,
           f.item_id,
           f.reason,
           f.outcome,
           src.run_source_id,
           src.run_job_type
    ${SERVES_IN_RANGE_SQL}
    CROSS JOIN LATERAL (
      SELECT given.item_id, given.outcome, s.reasons[array_position(s.item_ids, given.item_id)] AS reason
      FROM (
        SELECT a.item_id, 'accepted' AS outcome
        FROM unnest(s.accepted_item_ids) AS a(item_id)
        UNION ALL
        SELECT r.item_id, 'rejected'
        FROM unnest(s.rejected_item_ids) AS r(item_id)
        WHERE r.item_id <> ALL(s.accepted_item_ids)
      ) given
    ) f
    CROSS JOIN LATERAL (
      SELECT ${runSourceSql("f.reason")} AS run_source_id,
             ${runJobTypeSql("f.reason")} AS run_job_type
    ) src
    ${SERVE_FILTERS_SQL}
      AND ($7::text IS NULL OR f.reason = $7)
      AND ($9::uuid IS NULL OR src.run_source_id = $9)
  ),
  grouped AS (
    SELECT GROUPING(day, item_id, outlet_id, reason, daypart, run_source_id) AS grouping_set,
           coalesce(day, item_id, outlet_id::text, reason, daypart, run_source_id::text) AS key,
           outlet_id,
           run_source_id,
           min(run_job_type) AS run_job_type,
           (count(*) FILTER (WHERE outcome = 'accepted'))::int AS accepted,
           (count(*) FILTER (WHERE outcome = 'rejected'))::int AS rejected
    FROM feedback
    GROUP BY GROUPING SETS ((), (day), (item_id), (outlet_id), (reason), (daypart), (run_source_id))
    HAVING GROUPING(run_source_id) = 1 OR run_source_id IS NOT NULL
  )
  SELECT g.grouping_set, g.key, o.name AS outlet_name, g.run_job_type,
         coalesce(r.finished_at, r.started_at) AS run_at,
         r.id IS NOT NULL AS run_available,
         g.accepted, g.rejected
  FROM bounds
  CROSS JOIN grouped g
  LEFT JOIN outlets o
    ON o.id = g.outlet_id
  LEFT JOIN computation_runs r
    ON r.id = g.run_source_id
   AND r.brand_id = bounds.brand_id
  ORDER BY g.grouping_set, g.accepted + g.rejected DESC, g.accepted DESC, g.key
`;

// $7 = reason: keeps serves with any item of that reason. $9 = run id: keeps serves with any item from that run.
// $10 and $11 = the cursor's served_at and id, or NULL for the first page; the plain served_at bound lets the
// (brand_id, served_at) index stop at the cursor. $12 = page size + 1.
// LEFT JOIN page keeps one all-NULL row for a brand with no serves on the page.
const SERVES_LOG_SQL = `
  WITH ${BOUNDS_SQL},
  page AS (
    SELECT s.id, s.served_at, s.outlet_id, s.channel_id, s.daypart, s.item_ids, s.reasons,
           s.accepted_item_ids, s.rejected_item_ids
    ${SERVES_IN_RANGE_SQL}
    ${SERVE_FILTERS_SQL}
      AND ($7::text IS NULL OR $7 = ANY(s.reasons))
      AND ($9::uuid IS NULL OR EXISTS (
        SELECT 1 FROM unnest(s.reasons) AS item(reason) WHERE ${runSourceSql("item.reason")} = $9
      ))
      AND ($10::timestamptz IS NULL OR (s.served_at <= $10 AND (s.served_at, s.id) < ($10, $11::uuid)))
    ORDER BY s.served_at DESC, s.id DESC
    LIMIT $12
  )
  SELECT s.id, s.served_at,
         to_char(s.served_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
         s.outlet_id, o.name AS outlet_name, c.code AS channel_code, s.daypart,
         (SELECT json_agg(json_build_object(
                   'itemId', i.item_id,
                   'rank', i.rank,
                   'reason', i.reason,
                   'outcome', ${ITEM_OUTCOME_SQL}
                 ) ORDER BY i.rank)
          FROM unnest(s.item_ids, s.reasons) WITH ORDINALITY AS i(item_id, reason, rank)) AS items
  FROM bounds
  LEFT JOIN page s
    ON TRUE
  LEFT JOIN outlets o
    ON o.id = s.outlet_id
  LEFT JOIN channels c
    ON c.id = s.channel_id
  ORDER BY s.served_at DESC, s.id DESC
`;

// GROUPING(day, item_id, outlet_id, reason, daypart, run_source_id) of each grouping set.
const GROUPING_SET = {
  summary: 0b111111,
  day: 0b011111,
  item: 0b101111,
  outlet: 0b110111,
  reason: 0b111011,
  daypart: 0b111101,
  run: 0b111110,
} as const;

const CURSOR_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GroupedRow {
  grouping_set: number;
  key: string | null;
  outlet_name: string | null;
  run_job_type: FeedbackRunJobTypeSchemaType | null;
  run_at: Date | null;
  run_available: boolean;
  accepted: number;
  rejected: number;
}

interface ServeLogRow {
  id: string | null;
  served_at: Date;
  cursor_at: string;
  outlet_id: string;
  outlet_name: string;
  channel_code: string | null;
  daypart: string;
  items: { itemId: string; rank: number; reason: string; outcome: ServedItemOutcomeSchemaType | null }[];
}

interface Cursor {
  servedAt: string;
  id: string;
}

function toDateMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function assertValidRange(query: RecommendationFeedbackReportQuerySchemaType) {
  assertValidTimeZone(query.tz);
  if (query.from > query.to) {
    throw new ValidationError("from must not be after to.");
  }
  if ((toDateMs(query.to) - toDateMs(query.from)) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    throw new ValidationError(`The range must not be longer than ${MAX_RANGE_DAYS} days.`);
  }
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let ms = toDateMs(from); ms <= toDateMs(to); ms += DAY_MS) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}

function filterParams(query: RecommendationFeedbackReportQuerySchemaType) {
  return [
    query.outletId ?? null,
    query.daypart ?? null,
    query.reason ?? null,
    query.channelId ?? null,
    query.runId ?? null,
  ];
}

function toCounts(row: GroupedRow | undefined): FeedbackCountsSchemaType {
  return { accepted: row?.accepted ?? 0, rejected: row?.rejected ?? 0 };
}

function toBreakdownRow(row: GroupedRow): RecommendationFeedbackBreakdownRowSchemaType {
  const key = row.key as string;
  return { key, label: row.outlet_name ?? key, ...toCounts(row) };
}

function toRunRow(row: GroupedRow): RecommendationFeedbackRunRowSchemaType {
  const key = row.key as string;
  return {
    key,
    label: key,
    jobType: row.run_job_type as FeedbackRunJobTypeSchemaType,
    runAt: row.run_at?.toISOString() ?? null,
    runAvailable: row.run_available,
    ...toCounts(row),
  };
}

function toDays(
  from: string,
  to: string,
  dayRows: GroupedRow[],
): RecommendationFeedbackDaySchemaType[] {
  const byDate = new Map(dayRows.map((row) => [row.key, row]));
  return datesBetween(from, to).map((date) => ({ date, ...toCounts(byDate.get(date)) }));
}

function rowsOfSet(rows: GroupedRow[], groupingSet: number): GroupedRow[] {
  return rows.filter((row) => row.grouping_set === groupingSet);
}

export async function getRecommendationFeedbackReport(
  pool: Pool,
  brandId: string,
  query: RecommendationFeedbackReportQuerySchemaType,
): Promise<RecommendationFeedbackReportSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(RecommendationFeedbackReportQuerySchema, query);
  assertValidRange(query);

  const result = await pool.query<GroupedRow>(FEEDBACK_REPORT_SQL, [
    brandId,
    query.from,
    query.to,
    query.tz,
    ...filterParams(query),
  ]);

  const rows = result.rows;
  if (rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }
  const summary = rowsOfSet(rows, GROUPING_SET.summary)[0];
  return {
    brandId,
    from: query.from,
    to: query.to,
    tz: query.tz,
    summary: toCounts(summary),
    days: toDays(query.from, query.to, rowsOfSet(rows, GROUPING_SET.day)),
    byItem: rowsOfSet(rows, GROUPING_SET.item).map(toBreakdownRow),
    byOutlet: rowsOfSet(rows, GROUPING_SET.outlet).map(toBreakdownRow),
    byReason: rowsOfSet(rows, GROUPING_SET.reason).map(toBreakdownRow),
    byDaypart: rowsOfSet(rows, GROUPING_SET.daypart).map(toBreakdownRow),
    byRun: rowsOfSet(rows, GROUPING_SET.run).map(toRunRow),
  };
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function isValidCursorAt(servedAt: unknown): servedAt is string {
  if (typeof servedAt !== "string" || !CURSOR_AT_PATTERN.test(servedAt)) return false;
  // Date rolls impossible dates over (30 Feb → 2 Mar), so a mismatch means the time doesn't exist.
  const ms = Date.parse(servedAt);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 23) === servedAt.slice(0, 23);
}

function decodeCursor(before: string): Cursor {
  let cursor: Partial<Cursor> | null = null;
  try {
    cursor = JSON.parse(Buffer.from(before, "base64url").toString("utf8"));
  } catch {
    cursor = null;
  }
  if (!cursor || !isValidCursorAt(cursor.servedAt) || typeof cursor.id !== "string" || !UUID_PATTERN.test(cursor.id)) {
    throw new ValidationError("before is not a valid cursor.");
  }
  return { servedAt: cursor.servedAt, id: cursor.id };
}

function toServeLogEntry(row: ServeLogRow): RecommendationServeLogEntrySchemaType {
  return {
    id: row.id as string,
    servedAt: row.served_at.toISOString(),
    outletId: row.outlet_id,
    outletName: row.outlet_name,
    channelCode: row.channel_code,
    daypart: row.daypart,
    items: row.items.map((item) => ({ ...item, label: item.itemId })),
  };
}

export async function listRecommendationServes(
  pool: Pool,
  brandId: string,
  query: RecommendationServesQuerySchemaType,
): Promise<RecommendationServesSchemaType> {
  assertValid(BrandParamsSchema, { brandId });
  assertValid(RecommendationServesQuerySchema, query);
  assertValidRange(query);
  const cursor = query.before === undefined ? null : decodeCursor(query.before);
  const limit = query.limit ?? DEFAULT_SERVES_LIMIT;

  const result = await pool.query<ServeLogRow>(SERVES_LOG_SQL, [
    brandId,
    query.from,
    query.to,
    query.tz,
    ...filterParams(query),
    cursor?.servedAt ?? null,
    cursor?.id ?? null,
    limit + 1,
  ]);

  if (result.rows.length === 0) {
    throw new NotFoundError("Brand does not exist.");
  }
  const rows = result.rows.filter((row) => row.id !== null);
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  return {
    serves: pageRows.map(toServeLogEntry),
    nextCursor:
      rows.length > limit && last ? encodeCursor({ servedAt: last.cursor_at, id: last.id as string }) : null,
  };
}
