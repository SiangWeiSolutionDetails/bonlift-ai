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

// Recorded on every run. Shared by the API's manual runs and the worker's scheduled runs, so both record the same label.
export const CALCULATION_ALGORITHM_VERSIONS: Record<CalculationJobTypeSchemaType, string> = {
  outlet_item_scores: "p3-popularity",
  customer_item_scores: "h5-customer-recency",
  item_affinity: "p4-order-lift",
};
