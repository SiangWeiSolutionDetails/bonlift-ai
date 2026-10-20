import Type, { Static } from "typebox";

export const DaypartSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    start: Type.String({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" }),
    end: Type.String({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" }),
  },
  { additionalProperties: false },
);
export type DaypartSchemaType = Static<typeof DaypartSchema>;

export const OutletItemScoresConfigSchema = Type.Object(
  {
    dayparts: Type.Optional(Type.Array(DaypartSchema)),
  },
  { additionalProperties: false },
);
export type OutletItemScoresConfigSchemaType = Static<
  typeof OutletItemScoresConfigSchema
>;
