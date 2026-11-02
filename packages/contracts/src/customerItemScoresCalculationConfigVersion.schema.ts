import Type, { Static } from "typebox";
import { CalculationConfigVersionRecordSchema } from "./calculationConfigVersion.schema.js";

export const CustomerItemScoresCalculationConfigVersionRecordSchema = Type.Object(
  {
    ...CalculationConfigVersionRecordSchema.properties,
    jobType: Type.Literal("customer_item_scores"),
    halfLifeDays: Type.Integer({ minimum: 1 }),
    topN: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type CustomerItemScoresCalculationConfigVersionRecordSchemaType = Static<
  typeof CustomerItemScoresCalculationConfigVersionRecordSchema
>;

export const CustomerItemScoresCalculationConfigVersionsSchema = Type.Array(
  CustomerItemScoresCalculationConfigVersionRecordSchema,
);
export type CustomerItemScoresCalculationConfigVersionsSchemaType = Static<
  typeof CustomerItemScoresCalculationConfigVersionsSchema
>;

// Versions are immutable: this body creates the next version from the latest one.
export const CreateCustomerItemScoresCalculationConfigVersionBodySchema =
  Type.Object(
    {
      halfLifeDays: Type.Optional(Type.Integer({ minimum: 1 })),
      topN: Type.Optional(Type.Integer({ minimum: 1 })),
    },
    { additionalProperties: false, minProperties: 1 },
  );
export type CreateCustomerItemScoresCalculationConfigVersionBodySchemaType =
  Static<typeof CreateCustomerItemScoresCalculationConfigVersionBodySchema>;
