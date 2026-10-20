import Type, { Static } from "typebox";

export const CalculationQuerySchema = Type.Object(
  {
    from: Type.String({ pattern: "^[0-9]{8}$" }),
    to: Type.String({ pattern: "^[0-9]{8}$" }),
  },
  { additionalProperties: false },
);
export type CalculationQuerySchemaType = Static<typeof CalculationQuerySchema>;

export const CalculationResponseSchema = Type.Object(
  {
    runId: Type.String({ format: "uuid" }),
    outletId: Type.String({ format: "uuid" }),
    jobType: Type.Literal("outlet_item_scores"),
    from: Type.String({ pattern: "^[0-9]{8}$" }),
    to: Type.String({ pattern: "^[0-9]{8}$" }),
  },
  { additionalProperties: false },
);
export type CalculationResponseSchemaType = Static<
  typeof CalculationResponseSchema
>;

export const CalculationTriggerTypeSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("scheduled"),
  Type.Literal("backfill"),
]);
export type CalculationTriggerTypeSchemaType = Static<
  typeof CalculationTriggerTypeSchema
>;