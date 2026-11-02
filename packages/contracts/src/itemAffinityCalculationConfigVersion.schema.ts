import Type, { Static } from "typebox";
import { CalculationConfigVersionRecordSchema } from "./calculationConfigVersion.schema.js";

export const ItemAffinityCalculationConfigVersionRecordSchema = Type.Object(
  {
    ...CalculationConfigVersionRecordSchema.properties,
    jobType: Type.Literal("item_affinity"),
    topN: Type.Integer({ minimum: 1 }),
    minPairOrders: Type.Integer({ minimum: 1 }),
    maxOrderItems: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type ItemAffinityCalculationConfigVersionRecordSchemaType = Static<
  typeof ItemAffinityCalculationConfigVersionRecordSchema
>;

export const ItemAffinityCalculationConfigVersionsSchema = Type.Array(
  ItemAffinityCalculationConfigVersionRecordSchema,
);
export type ItemAffinityCalculationConfigVersionsSchemaType = Static<
  typeof ItemAffinityCalculationConfigVersionsSchema
>;

// Versions are immutable: this body creates the next version from the latest one.
export const CreateItemAffinityCalculationConfigVersionBodySchema = Type.Object(
  {
    topN: Type.Optional(Type.Integer({ minimum: 1 })),
    minPairOrders: Type.Optional(Type.Integer({ minimum: 1 })),
    maxOrderItems: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type CreateItemAffinityCalculationConfigVersionBodySchemaType = Static<
  typeof CreateItemAffinityCalculationConfigVersionBodySchema
>;
