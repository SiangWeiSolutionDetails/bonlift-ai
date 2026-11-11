import Type, { type Static } from "typebox";

const Count = Type.Integer({ minimum: 0 });
const FilterText = Type.String({ minLength: 1, maxLength: 64 });

// from and to are inclusive business dates, read in tz, as in the usage report. Every filter is optional and applies
// to the whole report; reason matches each served item's own reason.
const reportQueryProperties = {
  from: Type.String({ format: "date" }),
  to: Type.String({ format: "date" }),
  tz: Type.String({ minLength: 1, maxLength: 64 }),
  outletId: Type.Optional(Type.String({ format: "uuid" })),
  daypart: Type.Optional(FilterText),
  reason: Type.Optional(FilterText),
  channelId: Type.Optional(Type.String({ format: "uuid" })),
};

export const RecommendationFeedbackReportQuerySchema = Type.Object(reportQueryProperties, {
  additionalProperties: false,
});
export type RecommendationFeedbackReportQuerySchemaType = Static<
  typeof RecommendationFeedbackReportQuerySchema
>;

// before is the nextCursor of the previous page. On the serves log, reason keeps serves with at least one item of
// that reason, and each kept serve lists all its items.
export const RecommendationServesQuerySchema = Type.Object(
  {
    ...reportQueryProperties,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    before: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  },
  { additionalProperties: false },
);
export type RecommendationServesQuerySchemaType = Static<typeof RecommendationServesQuerySchema>;

// awaiting: no feedback yet and the 2-hour feedback window is still open. ignored: no feedback and the window closed.
export const ServedItemOutcomeSchema = Type.Union([
  Type.Literal("accepted"),
  Type.Literal("rejected"),
  Type.Literal("ignored"),
  Type.Literal("awaiting"),
]);
export type ServedItemOutcomeSchemaType = Static<typeof ServedItemOutcomeSchema>;

// acceptanceRate = accepted / (accepted + rejected + ignored), between 0 and 1; awaiting items are left out, and it is
// null when nothing has an outcome yet.
export const FeedbackCountsSchema = Type.Object(
  {
    servedItems: Count,
    accepted: Count,
    rejected: Count,
    ignored: Count,
    awaiting: Count,
    acceptanceRate: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
  },
  { additionalProperties: false },
);
export type FeedbackCountsSchemaType = Static<typeof FeedbackCountsSchema>;

// serves: recommendation responses with at least one item counted in servedItems.
export const RecommendationFeedbackSummarySchema = Type.Object(
  {
    ...FeedbackCountsSchema.properties,
    serves: Count,
  },
  { additionalProperties: false },
);
export type RecommendationFeedbackSummarySchemaType = Static<
  typeof RecommendationFeedbackSummarySchema
>;

export const RecommendationFeedbackDaySchema = Type.Object(
  {
    date: Type.String({ format: "date" }),
    ...FeedbackCountsSchema.properties,
  },
  { additionalProperties: false },
);
export type RecommendationFeedbackDaySchemaType = Static<typeof RecommendationFeedbackDaySchema>;

// key: item id, outlet id, reason or daypart. label: the outlet name for outlets, otherwise the key.
export const RecommendationFeedbackBreakdownRowSchema = Type.Object(
  {
    key: Type.String(),
    label: Type.String(),
    ...FeedbackCountsSchema.properties,
  },
  { additionalProperties: false },
);
export type RecommendationFeedbackBreakdownRowSchemaType = Static<
  typeof RecommendationFeedbackBreakdownRowSchema
>;

// days has one row per date from from to to, zeros included. Breakdowns are sorted by servedItems descending, then key.
export const RecommendationFeedbackReportSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    tz: Type.String(),
    summary: RecommendationFeedbackSummarySchema,
    days: Type.Array(RecommendationFeedbackDaySchema),
    byItem: Type.Array(RecommendationFeedbackBreakdownRowSchema),
    byOutlet: Type.Array(RecommendationFeedbackBreakdownRowSchema),
    byReason: Type.Array(RecommendationFeedbackBreakdownRowSchema),
    byDaypart: Type.Array(RecommendationFeedbackBreakdownRowSchema),
  },
  { additionalProperties: false },
);
export type RecommendationFeedbackReportSchemaType = Static<
  typeof RecommendationFeedbackReportSchema
>;

// label is the item id: serves store only ids.
export const ServedItemSchema = Type.Object(
  {
    itemId: Type.String(),
    label: Type.String(),
    rank: Type.Integer({ minimum: 1 }),
    reason: Type.String(),
    outcome: ServedItemOutcomeSchema,
  },
  { additionalProperties: false },
);
export type ServedItemSchemaType = Static<typeof ServedItemSchema>;

// channelCode null: served with a key without a channel.
export const RecommendationServeLogEntrySchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    servedAt: Type.String({ format: "date-time" }),
    outletId: Type.String({ format: "uuid" }),
    outletName: Type.String(),
    channelCode: Type.Union([Type.String(), Type.Null()]),
    daypart: Type.String(),
    items: Type.Array(ServedItemSchema),
  },
  { additionalProperties: false },
);
export type RecommendationServeLogEntrySchemaType = Static<
  typeof RecommendationServeLogEntrySchema
>;

// Newest first. nextCursor is null on the last page; otherwise pass it as before for the next page.
export const RecommendationServesSchema = Type.Object(
  {
    serves: Type.Array(RecommendationServeLogEntrySchema),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export type RecommendationServesSchemaType = Static<typeof RecommendationServesSchema>;
