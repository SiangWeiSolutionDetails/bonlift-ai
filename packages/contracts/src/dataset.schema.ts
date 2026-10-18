import Type, { Static } from "typebox";

export const DatasetLineItemSchema = Type.Object({
  itemId: Type.String({ minLength: 1 }),
  itemName: Type.String({ minLength: 1 }),
  qty: Type.Number({ exclusiveMinimum: 0 }),
  unitPrice: Type.Number(),
});
export type DatasetLineItemSchemaType = Static<typeof DatasetLineItemSchema>;

export const DatasetSchema = Type.Object({
  outletName: Type.String({ minLength: 1 }),
  dates: Type.Array(
    Type.Object({
      date: Type.String({ pattern: "^[0-9]{8}$" }),
      orders: Type.Array(
        Type.Object({
          orderId: Type.String({ minLength: 1 }),
          orderedAt: Type.String({ format: "date-time" }),
          orderTotal: Type.Number({ minimum: 0 }),
          customerId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          lines: Type.Array(
            Type.Object({
              ...DatasetLineItemSchema.properties,
              addons: Type.Optional(Type.Array(DatasetLineItemSchema)),
              modifiers: Type.Optional(Type.Array(DatasetLineItemSchema)),
            }),
          ),
        }),
      ),
    }),
    { minItems: 1, maxItems: 92 },
  ),
});
export type DatasetSchemaType = Static<typeof DatasetSchema>;

export const DatasetResultSchema = Type.Object(
  {
    outletId: Type.String({ format: "uuid" }),
    dates: Type.Array(
      Type.Object(
        {
          date: Type.String({ pattern: "^[0-9]{8}$" }),
          orderCount: Type.Integer({ minimum: 0 }),
          created: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 92 },
    ),
  },
  { additionalProperties: false },
);
export type DatasetResultSchemaType = Static<typeof DatasetResultSchema>;
