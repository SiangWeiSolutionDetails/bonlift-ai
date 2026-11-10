import Type, { Static } from "typebox";

// Daily local time, 24-hour "HH:MM".
const RunTimeSchema = Type.String({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" });
// IANA zone name; the API checks it against Postgres's pg_timezone_names, which the schema cannot express.
const TimeZoneSchema = Type.String({ minLength: 1, maxLength: 64 });
// Inclusive days of order history ending yesterday in the schedule's time zone.
const WindowDaysSchema = Type.Integer({ minimum: 1, maximum: 366 });
const NullableDateTime = Type.Union([Type.String({ format: "date-time" }), Type.Null()]);

// One schedule per brand: every night at runTime in timeZone, it queues an outlet item scores run per live outlet,
// plus one customer item scores and one item affinity run for the brand.
export const BrandCalculationScheduleRecordSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    isEnabled: Type.Boolean(),
    runTime: RunTimeSchema,
    timeZone: TimeZoneSchema,
    outletWindowDays: WindowDaysSchema,
    customerWindowDays: WindowDaysSchema,
    affinityWindowDays: WindowDaysSchema,
    updatedBy: Type.Union([Type.String(), Type.Null()]),
    updatedAt: Type.String({ format: "date-time" }),
    // Null while disabled.
    nextRunAt: NullableDateTime,
    // Written by the worker after each scheduled run; all null before the first one.
    lastRunAt: NullableDateTime,
    lastQueued: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    lastFailedToQueue: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    lastError: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export type BrandCalculationScheduleRecordSchemaType = Static<
  typeof BrandCalculationScheduleRecordSchema
>;

export const UpdateBrandCalculationScheduleBodySchema = Type.Object(
  {
    isEnabled: Type.Optional(Type.Boolean()),
    runTime: Type.Optional(RunTimeSchema),
    timeZone: Type.Optional(TimeZoneSchema),
    outletWindowDays: Type.Optional(WindowDaysSchema),
    customerWindowDays: Type.Optional(WindowDaysSchema),
    affinityWindowDays: Type.Optional(WindowDaysSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateBrandCalculationScheduleBodySchemaType = Static<
  typeof UpdateBrandCalculationScheduleBodySchema
>;
