import Type, { Static } from "typebox";

export const CustomerItemScoresCalculationQuerySchema = Type.Object(
  {
    from: Type.String({ pattern: "^[0-9]{8}$" }),
    to: Type.String({ pattern: "^[0-9]{8}$" }),
  },
  { additionalProperties: false },
);
export type CustomerItemScoresCalculationQuerySchemaType = Static<
  typeof CustomerItemScoresCalculationQuerySchema
>;

export const CustomerItemScoresCalculationResponseSchema = Type.Object(
  {
    runId: Type.String({ format: "uuid" }),
    brandId: Type.String({ format: "uuid" }),
    jobType: Type.Literal("customer_item_scores"),
    from: Type.String({ pattern: "^[0-9]{8}$" }),
    to: Type.String({ pattern: "^[0-9]{8}$" }),
  },
  { additionalProperties: false },
);
export type CustomerItemScoresCalculationResponseSchemaType = Static<
  typeof CustomerItemScoresCalculationResponseSchema
>;
