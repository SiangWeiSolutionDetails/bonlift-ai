import type {
  RecommendationFeedbackBreakdownRowSchemaType,
  RecommendationFeedbackDaySchemaType,
  RecommendationFeedbackReportSchemaType,
  RecommendationFeedbackSummarySchemaType,
  RecommendationServeLogEntrySchemaType,
  RecommendationServesSchemaType,
  ServedItemOutcomeSchemaType,
  ServedItemSchemaType,
} from "@bonlift-ai/contracts";

export type FeedbackReport = RecommendationFeedbackReportSchemaType;
export type FeedbackSummary = RecommendationFeedbackSummarySchemaType;
export type FeedbackDay = RecommendationFeedbackDaySchemaType;
export type FeedbackBreakdownRow = RecommendationFeedbackBreakdownRowSchemaType;
export type ServesPage = RecommendationServesSchemaType;
export type ServeLogEntry = RecommendationServeLogEntrySchemaType;
export type ServedItem = ServedItemSchemaType;
export type ServedItemOutcome = ServedItemOutcomeSchemaType;

// Every filter the report and the serves log share; tz is added by the queries.
export type FeedbackFilters = {
  from: string;
  to: string;
  outletId?: string;
  daypart?: string;
  reason?: string;
  channelId?: string;
};
