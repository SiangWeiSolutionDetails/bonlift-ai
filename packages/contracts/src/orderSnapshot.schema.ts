import Type, { Static } from "typebox";

const NullableInteger = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);

export const OrderSnapshotDaySchema = Type.Object(
  {
    date: Type.String({ format: "date" }),
    isStored: Type.Boolean(),
    orderCount: NullableInteger,
    sizeBytes: NullableInteger,
    updatedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    isStale: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type OrderSnapshotDaySchemaType = Static<typeof OrderSnapshotDaySchema>;

export const OrderSnapshotPublishedRunSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    startedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type OrderSnapshotPublishedRunSchemaType = Static<
  typeof OrderSnapshotPublishedRunSchema
>;

export const OrderSnapshotCoverageSchema = Type.Object(
  {
    outletId: Type.String({ format: "uuid" }),
    publishedRun: Type.Union([OrderSnapshotPublishedRunSchema, Type.Null()]),
    days: Type.Array(OrderSnapshotDaySchema),
  },
  { additionalProperties: false },
);
export type OrderSnapshotCoverageSchemaType = Static<
  typeof OrderSnapshotCoverageSchema
>;
