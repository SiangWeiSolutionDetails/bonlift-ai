import Type, { Static } from "typebox";
import { CalculationConfigVersionRecordSchema } from "./calculationConfigVersion.schema.js";

export const DaypartSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    start: Type.String({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" }),
    end: Type.String({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" }),
  },
  { additionalProperties: false },
);
export type DaypartSchemaType = Static<typeof DaypartSchema>;

export const OutletItemScoresCalculationConfigVersionRecordSchema = Type.Object(
  {
    ...CalculationConfigVersionRecordSchema.properties,
    jobType: Type.Literal("outlet_item_scores"),
    halfLifeDays: Type.Integer({ minimum: 1 }),
    topN: Type.Integer({ minimum: 1 }),
    dayparts: Type.Array(DaypartSchema),
  },
  { additionalProperties: false },
);
export type OutletItemScoresCalculationConfigVersionRecordSchemaType = Static<
  typeof OutletItemScoresCalculationConfigVersionRecordSchema
>;

export const OutletItemScoresCalculationConfigVersionsSchema = Type.Array(
  OutletItemScoresCalculationConfigVersionRecordSchema,
);
export type OutletItemScoresCalculationConfigVersionsSchemaType = Static<
  typeof OutletItemScoresCalculationConfigVersionsSchema
>;

// Versions are immutable: this body creates the next version from the latest one.
export const CreateOutletItemScoresCalculationConfigVersionBodySchema =
  Type.Object(
    {
      halfLifeDays: Type.Optional(Type.Integer({ minimum: 1 })),
      topN: Type.Optional(Type.Integer({ minimum: 1 })),
      dayparts: Type.Optional(Type.Array(DaypartSchema)),
    },
    { additionalProperties: false, minProperties: 1 },
  );
export type CreateOutletItemScoresCalculationConfigVersionBodySchemaType =
  Static<typeof CreateOutletItemScoresCalculationConfigVersionBodySchema>;
