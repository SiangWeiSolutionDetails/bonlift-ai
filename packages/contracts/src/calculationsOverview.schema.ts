import Type, { type Static } from "typebox";
import { CalculationJobTypeSchema, CalculationTriggerTypeSchema } from "./calculation.schema.js";
import { CalculationRunStatusSchema } from "./outletItemScoresResult.schema.js";

const Count = Type.Integer({ minimum: 0 });
const NullableString = Type.Union([Type.String(), Type.Null()]);
const NullableDateTime = Type.Union([Type.String({ format: "date-time" }), Type.Null()]);

const CompactDate = Type.String({ pattern: "^[0-9]{8}$" });

// Inclusive YYYYMMDD dates, like the single-calculation routes.
export const CalculationWindowSchema = Type.Object(
  { from: CompactDate, to: CompactDate },
  { additionalProperties: false },
);
export type CalculationWindowSchemaType = Static<typeof CalculationWindowSchema>;

// A calculation left out uses its window from the brand's schedule (the last N days, ending yesterday).
export const BrandCalculationsStartBodySchema = Type.Object(
  {
    windows: Type.Optional(
      Type.Object(
        {
          outlet_item_scores: Type.Optional(CalculationWindowSchema),
          customer_item_scores: Type.Optional(CalculationWindowSchema),
          item_affinity: Type.Optional(CalculationWindowSchema),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type BrandCalculationsStartBodySchemaType = Static<typeof BrandCalculationsStartBodySchema>;

// POST /calculate/all/:brandId — one run per live outlet with data for outlet item scores, one each for the
// brand-level calculations. Scopes already running or without order snapshots in their window are skipped.
export const BrandCalculationsStartedRunSchema = Type.Object(
  {
    runId: Type.String({ format: "uuid" }),
    jobType: CalculationJobTypeSchema,
    outletId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  },
  { additionalProperties: false },
);
export type BrandCalculationsStartedRunSchemaType = Static<typeof BrandCalculationsStartedRunSchema>;

export const BrandCalculationsStartResponseSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    runs: Type.Array(BrandCalculationsStartedRunSchema),
    queued: Count,
    failedToQueue: Count,
  },
  { additionalProperties: false },
);
export type BrandCalculationsStartResponseSchemaType = Static<typeof BrandCalculationsStartResponseSchema>;

export const CalculationOverviewRunSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    status: CalculationRunStatusSchema,
    triggerType: CalculationTriggerTypeSchema,
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    rowCount: Type.Union([Type.Integer(), Type.Null()]),
    error: NullableString,
    startedAt: Type.String({ format: "date-time" }),
    finishedAt: NullableDateTime,
  },
  { additionalProperties: false },
);
export type CalculationOverviewRunSchemaType = Static<typeof CalculationOverviewRunSchema>;

const NullableRun = Type.Union([CalculationOverviewRunSchema, Type.Null()]);

// One row per live outlet. latestRun = most recent run of any status; publishedRun = the run serving uses now.
// hasOrdersInWindow: the outlet has order snapshots inside the brand schedule's outlet window (else Run all skips it).
export const CalculationOverviewOutletSchema = Type.Object(
  {
    outletId: Type.String({ format: "uuid" }),
    outletName: Type.String(),
    isActive: Type.Boolean(),
    hasOrdersInWindow: Type.Boolean(),
    latestRun: NullableRun,
    publishedRun: NullableRun,
  },
  { additionalProperties: false },
);
export type CalculationOverviewOutletSchemaType = Static<typeof CalculationOverviewOutletSchema>;

// Headline numbers, all taken from the published run(s); 0 when nothing is published.
export const CalculationOverviewMetricsSchema = Type.Object(
  {
    // outlet_item_scores: distinct items scored across outlets; customer_item_scores: distinct customers;
    // item_affinity: distinct items that have at least one partner.
    subjects: Count,
    // Score rows in the published run(s).
    rows: Count,
  },
  { additionalProperties: false },
);
export type CalculationOverviewMetricsSchemaType = Static<typeof CalculationOverviewMetricsSchema>;

// One entry per calculation, so a new calculation is a new entry, not a contract change.
// scope "outlet": latestRun/publishedRun are null and the per-outlet state is in outlets.
// scope "brand": outlets is an empty array.
// resultsAgeDays: days between the published window's end (oldest across active outlets for scope "outlet") and
// yesterday in the schedule's time zone; null when nothing is published.
export const CalculationOverviewEntrySchema = Type.Object(
  {
    jobType: CalculationJobTypeSchema,
    scope: Type.Union([Type.Literal("brand"), Type.Literal("outlet")]),
    windowDays: Type.Integer({ minimum: 1 }),
    latestRun: NullableRun,
    publishedRun: NullableRun,
    outlets: Type.Array(CalculationOverviewOutletSchema),
    runningRuns: Count,
    failedRunsLast7Days: Count,
    resultsAgeDays: Type.Union([Type.Integer(), Type.Null()]),
    metrics: CalculationOverviewMetricsSchema,
  },
  { additionalProperties: false },
);
export type CalculationOverviewEntrySchemaType = Static<typeof CalculationOverviewEntrySchema>;

// Strongest pairs of the published item affinity run, by confidence then lift.
export const CalculationOverviewTopPairSchema = Type.Object(
  {
    itemA: Type.String(),
    itemAName: NullableString,
    itemB: Type.String(),
    itemBName: NullableString,
    confidence: Type.Number(),
    lift: Type.Number(),
    nPair: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type CalculationOverviewTopPairSchemaType = Static<typeof CalculationOverviewTopPairSchema>;

// Most-ordered items across all outlets' published outlet item scores: n_orders of the all_day list summed over
// outlets (the daypart lists count the same orders again, so they are not added). outlets = outlets whose all_day
// list has the item.
export const CalculationOverviewTopItemSchema = Type.Object(
  {
    itemId: Type.String(),
    itemName: NullableString,
    nOrders: Count,
    outlets: Count,
  },
  { additionalProperties: false },
);
export type CalculationOverviewTopItemSchemaType = Static<typeof CalculationOverviewTopItemSchema>;

// GET /brands/:brandId/calculations/overview
export const CalculationsOverviewSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    timeZone: Type.String(),
    // Inclusive end of every window Run all would use (yesterday in timeZone).
    windowTo: Type.String({ format: "date" }),
    calculations: Type.Array(CalculationOverviewEntrySchema),
    topPairs: Type.Array(CalculationOverviewTopPairSchema),
    topItems: Type.Array(CalculationOverviewTopItemSchema),
  },
  { additionalProperties: false },
);
export type CalculationsOverviewSchemaType = Static<typeof CalculationsOverviewSchema>;
