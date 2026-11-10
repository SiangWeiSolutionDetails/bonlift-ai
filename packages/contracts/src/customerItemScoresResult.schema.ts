import Type, { Static } from "typebox";
import { CalculationTriggerTypeSchema } from "./calculation.schema.js";
import { CalculationRunStatusSchema } from "./outletItemScoresResult.schema.js";

const NullableString = Type.Union([Type.String(), Type.Null()]);

export const CustomerItemScoresRunRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    brandId: Type.String({ format: "uuid" }),
    status: CalculationRunStatusSchema,
    runDate: Type.String({ format: "date" }),
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    configVersion: Type.Integer({ minimum: 1 }),
    halfLifeDays: Type.Integer({ minimum: 1 }),
    topN: Type.Integer({ minimum: 1 }),
    maxRecentOrders: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
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
export type CustomerItemScoresRunRecordSchemaType = Static<
  typeof CustomerItemScoresRunRecordSchema
>;

export const CustomerItemScoresRunListSchema = Type.Object(
  { runs: Type.Array(CustomerItemScoresRunRecordSchema) },
  { additionalProperties: false },
);
export type CustomerItemScoresRunListSchemaType = Static<
  typeof CustomerItemScoresRunListSchema
>;

export const CustomerItemScoresRunListQuerySchema = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) },
  { additionalProperties: false },
);
export type CustomerItemScoresRunListQuerySchemaType = Static<
  typeof CustomerItemScoresRunListQuerySchema
>;

export const PublishCustomerItemScoresRunBodySchema = Type.Object(
  { runId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
export type PublishCustomerItemScoresRunBodySchemaType = Static<
  typeof PublishCustomerItemScoresRunBodySchema
>;

export const CustomerItemScoresCustomerListQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
    after: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type CustomerItemScoresCustomerListQuerySchemaType = Static<
  typeof CustomerItemScoresCustomerListQuerySchema
>;

// A POST body, not a query string: the plain mobile number or email must never appear in a URL, where request and
// proxy logs record it.
export const CustomerItemScoresCustomerSearchBodySchema = Type.Object(
  { customerId: Type.String({ minLength: 1, maxLength: 320 }) },
  { additionalProperties: false },
);
export type CustomerItemScoresCustomerSearchBodySchemaType = Static<
  typeof CustomerItemScoresCustomerSearchBodySchema
>;

export const CustomerItemScoresCustomerListSchema = Type.Object(
  {
    customers: Type.Array(
      Type.Object(
        {
          customerId: Type.String(),
          itemCount: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    nextAfter: NullableString,
  },
  { additionalProperties: false },
);
export type CustomerItemScoresCustomerListSchemaType = Static<
  typeof CustomerItemScoresCustomerListSchema
>;

export const CustomerItemScoresCustomerParamsSchema = Type.Object({
  runId: Type.String({ format: "uuid" }),
  customerId: Type.String({ minLength: 1 }),
});
export type CustomerItemScoresCustomerParamsSchemaType = Static<
  typeof CustomerItemScoresCustomerParamsSchema
>;

export const CustomerItemScoreRecordSchema = Type.Object(
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
export type CustomerItemScoreRecordSchemaType = Static<
  typeof CustomerItemScoreRecordSchema
>;

export const CustomerItemScoresCustomerResultSchema = Type.Object(
  {
    customerId: Type.String(),
    items: Type.Array(CustomerItemScoreRecordSchema),
  },
  { additionalProperties: false },
);
export type CustomerItemScoresCustomerResultSchemaType = Static<
  typeof CustomerItemScoresCustomerResultSchema
>;
