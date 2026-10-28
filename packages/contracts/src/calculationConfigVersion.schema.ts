import Type, { Static } from "typebox";
import { CalculationJobTypeSchema } from "./calculation.schema.js";

export const CalculationConfigVersionRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    brandId: Type.String({ format: "uuid" }),
    jobType: CalculationJobTypeSchema,
    version: Type.Integer({ minimum: 1 }),
    createdBy: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type CalculationConfigVersionRecordSchemaType = Static<
  typeof CalculationConfigVersionRecordSchema
>;
