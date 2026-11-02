import Type, { Static } from "typebox";

export const ItemAffinityCalculationQuerySchema = Type.Object(
  {
    from: Type.String({ pattern: "^[0-9]{8}$" }),
    to: Type.String({ pattern: "^[0-9]{8}$" }),
  },
  { additionalProperties: false },
);
export type ItemAffinityCalculationQuerySchemaType = Static<
  typeof ItemAffinityCalculationQuerySchema
>;

export const ItemAffinityCalculationResponseSchema = Type.Object(
  {
    runId: Type.String({ format: "uuid" }),
    brandId: Type.String({ format: "uuid" }),
    jobType: Type.Literal("item_affinity"),
    from: Type.String({ pattern: "^[0-9]{8}$" }),
    to: Type.String({ pattern: "^[0-9]{8}$" }),
  },
  { additionalProperties: false },
);
export type ItemAffinityCalculationResponseSchemaType = Static<
  typeof ItemAffinityCalculationResponseSchema
>;
