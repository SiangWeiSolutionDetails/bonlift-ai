import Type, { Static } from "typebox";

export const DatasetLineItemSchema = Type.Object({
  itemId: Type.String({ minLength: 1 }),
  itemName: Type.String({ minLength: 1 }),
  qty: Type.Number({ exclusiveMinimum: 0 }),
  unitPrice: Type.Number(),
});
export type DatasetLineItemSchemaType = Static<typeof DatasetLineItemSchema>;

export const DatasetLineSchema = Type.Object({
  itemId: Type.String({ minLength: 1 }),
  itemName: Type.String({ minLength: 1 }),
  qty: Type.Number({ exclusiveMinimum: 0 }),
  unitPrice: Type.Number(),
  addons: Type.Optional(Type.Array(DatasetLineItemSchema)),
  modifiers: Type.Optional(Type.Array(DatasetLineItemSchema)),
});
export type DatasetLineSchemaType = Static<typeof DatasetLineSchema>;

export const DatasetOrderSchema = Type.Object({
  orderId: Type.String({ minLength: 1 }),
  orderedAt: Type.String({ format: "date-time" }),
  orderTotal: Type.Number({ minimum: 0 }),
  customerId: Type.Optional(Type.String()),
  lines: Type.Array(DatasetLineSchema),
});
export type DatasetOrderSchemaType = Static<typeof DatasetOrderSchema>;

export const DatasetDaySchema = Type.Object({
  date: Type.String({ pattern: "^[0-9]{8}$" }),
  orders: Type.Array(DatasetOrderSchema),
});
export type DatasetDaySchemaType = Static<typeof DatasetDaySchema>;

export const DatasetSchema = Type.Object({
  outletName: Type.String({ minLength: 1 }),
  dates: Type.Array(DatasetDaySchema),
});
export type DatasetSchemaType = Static<typeof DatasetSchema>;
