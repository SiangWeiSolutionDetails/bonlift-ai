import Type, { Static } from "typebox";

// from and to are inclusive dates: from = to calculates a single day.
export const OutletItemScoresCalculationQuerySchema = Type.Object(
  {
    from: Type.String({ pattern: "^[0-9]{8}$" }),
    to: Type.String({ pattern: "^[0-9]{8}$" }),
  },
  { additionalProperties: false },
);
export type OutletItemScoresCalculationQuerySchemaType = Static<
  typeof OutletItemScoresCalculationQuerySchema
>;

export const OutletItemScoresCalculationResponseSchema = Type.Object(
  {
    runId: Type.String({ format: "uuid" }),
    outletId: Type.String({ format: "uuid" }),
    jobType: Type.Literal("outlet_item_scores"),
    from: Type.String({ pattern: "^[0-9]{8}$" }),
    to: Type.String({ pattern: "^[0-9]{8}$" }),
  },
  { additionalProperties: false },
);
export type OutletItemScoresCalculationResponseSchemaType = Static<
  typeof OutletItemScoresCalculationResponseSchema
>;
