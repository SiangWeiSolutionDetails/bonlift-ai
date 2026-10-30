import Type, { Static } from "typebox";
import { CalculationTriggerTypeSchema } from "./calculation.schema.js";
import { DaypartSchema } from "./outletItemScoresCalculationConfigVersion.schema.js";

const NullableString = Type.Union([Type.String(), Type.Null()]);

export const CalculationRunStatusSchema = Type.Union([
  Type.Literal("running"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
]);
export type CalculationRunStatusSchemaType = Static<
  typeof CalculationRunStatusSchema
>;

export const OutletItemScoresRunRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    outletId: Type.String({ format: "uuid" }),
    status: CalculationRunStatusSchema,
    runDate: Type.String({ format: "date" }),
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    configVersion: Type.Integer({ minimum: 1 }),
    halfLifeDays: Type.Integer({ minimum: 1 }),
    topN: Type.Integer({ minimum: 1 }),
    dayparts: Type.Array(DaypartSchema),
    algorithmVersion: Type.String(),
    triggerType: CalculationTriggerTypeSchema,
    rowCount: Type.Union([Type.Integer(), Type.Null()]),
    error: NullableString,
    startedAt: Type.String({ format: "date-time" }),
    finishedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    isPublished: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type OutletItemScoresRunRecordSchemaType = Static<
  typeof OutletItemScoresRunRecordSchema
>;

export const OutletItemScoresRunListSchema = Type.Object(
  { runs: Type.Array(OutletItemScoresRunRecordSchema) },
  { additionalProperties: false },
);
export type OutletItemScoresRunListSchemaType = Static<
  typeof OutletItemScoresRunListSchema
>;

export const OutletItemScoresRunListQuerySchema = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) },
  { additionalProperties: false },
);
export type OutletItemScoresRunListQuerySchemaType = Static<
  typeof OutletItemScoresRunListQuerySchema
>;

export const RunParamsSchema = Type.Object({
  runId: Type.String({ format: "uuid" }),
});
export type RunParamsSchemaType = Static<typeof RunParamsSchema>;

export const OutletItemScoreRecordSchema = Type.Object(
  {
    daypart: Type.String(),
    rank: Type.Integer({ minimum: 1 }),
    itemId: Type.String(),
    itemName: NullableString,
    score: Type.Number({ minimum: 0, maximum: 1 }),
    nOrders: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type OutletItemScoreRecordSchemaType = Static<
  typeof OutletItemScoreRecordSchema
>;

export const OutletItemScoresRunResultSchema = Type.Object(
  {
    run: OutletItemScoresRunRecordSchema,
    items: Type.Array(OutletItemScoreRecordSchema),
  },
  { additionalProperties: false },
);
export type OutletItemScoresRunResultSchemaType = Static<
  typeof OutletItemScoresRunResultSchema
>;
