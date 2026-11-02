import Type, { Static } from "typebox";
import { CalculationTriggerTypeSchema } from "./calculation.schema.js";
import { CalculationRunStatusSchema } from "./outletItemScoresResult.schema.js";

const NullableString = Type.Union([Type.String(), Type.Null()]);

export const ItemAffinityRunRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    brandId: Type.String({ format: "uuid" }),
    status: CalculationRunStatusSchema,
    runDate: Type.String({ format: "date" }),
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    configVersion: Type.Integer({ minimum: 1 }),
    topN: Type.Integer({ minimum: 1 }),
    minPairOrders: Type.Integer({ minimum: 1 }),
    maxOrderItems: Type.Integer({ minimum: 1 }),
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
export type ItemAffinityRunRecordSchemaType = Static<
  typeof ItemAffinityRunRecordSchema
>;

export const ItemAffinityRunListSchema = Type.Object(
  { runs: Type.Array(ItemAffinityRunRecordSchema) },
  { additionalProperties: false },
);
export type ItemAffinityRunListSchemaType = Static<
  typeof ItemAffinityRunListSchema
>;

export const ItemAffinityRunListQuerySchema = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) },
  { additionalProperties: false },
);
export type ItemAffinityRunListQuerySchemaType = Static<
  typeof ItemAffinityRunListQuerySchema
>;

export const PublishItemAffinityRunBodySchema = Type.Object(
  { runId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
export type PublishItemAffinityRunBodySchemaType = Static<
  typeof PublishItemAffinityRunBodySchema
>;

export const ItemAffinityItemRecordSchema = Type.Object(
  {
    itemId: Type.String(),
    itemName: NullableString,
    nOrders: Type.Integer({ minimum: 1 }),
    pairCount: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type ItemAffinityItemRecordSchemaType = Static<
  typeof ItemAffinityItemRecordSchema
>;

export const ItemAffinityItemListSchema = Type.Object(
  { items: Type.Array(ItemAffinityItemRecordSchema) },
  { additionalProperties: false },
);
export type ItemAffinityItemListSchemaType = Static<
  typeof ItemAffinityItemListSchema
>;

export const ItemAffinityItemParamsSchema = Type.Object({
  runId: Type.String({ format: "uuid" }),
  itemId: Type.String({ minLength: 1 }),
});
export type ItemAffinityItemParamsSchemaType = Static<
  typeof ItemAffinityItemParamsSchema
>;

export const ItemAffinityPartnerRecordSchema = Type.Object(
  {
    rank: Type.Integer({ minimum: 1 }),
    itemId: Type.String(),
    itemName: NullableString,
    nPair: Type.Integer({ minimum: 1 }),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    lift: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type ItemAffinityPartnerRecordSchemaType = Static<
  typeof ItemAffinityPartnerRecordSchema
>;

export const ItemAffinityItemResultSchema = Type.Object(
  {
    itemId: Type.String(),
    itemName: NullableString,
    nOrders: Type.Integer({ minimum: 1 }),
    partners: Type.Array(ItemAffinityPartnerRecordSchema),
  },
  { additionalProperties: false },
);
export type ItemAffinityItemResultSchemaType = Static<
  typeof ItemAffinityItemResultSchema
>;
