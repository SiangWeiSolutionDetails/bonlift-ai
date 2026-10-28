import Type, { Static } from "typebox";

export const CalculationTriggerTypeSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("scheduled"),
  Type.Literal("backfill"),
]);
export type CalculationTriggerTypeSchemaType = Static<
  typeof CalculationTriggerTypeSchema
>;

export const CalculationJobTypeSchema = Type.Union([
  Type.Literal("outlet_item_scores"),
  Type.Literal("item_affinity"),
  Type.Literal("customer_item_scores"),
]);
export type CalculationJobTypeSchemaType = Static<
  typeof CalculationJobTypeSchema
>;
