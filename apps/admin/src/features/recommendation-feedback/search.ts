// Relative, not "@/": this file is unit-tested and the root vitest config has no alias.
import { validateUsageSearch, type UsageSearch } from "../brand-usage/search";
import { FEEDBACK_REASONS } from "./feedback";

export type RecommendationFeedbackSearch = UsageSearch & {
  outletId?: string;
  daypart?: string;
  reason?: string;
  channelId?: string;
  runId?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILTER_LENGTH = 64;

function optionalUuid(value: unknown) {
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

function optionalFilterText(value: unknown) {
  return typeof value === "string" && value !== "" && value.length <= MAX_FILTER_LENGTH
    ? value
    : undefined;
}

function optionalReason(value: unknown) {
  return FEEDBACK_REASONS.find((reason) => reason === value);
}

// Same rules as the usage page for brand and range. Filters the API would reject with a 400 are dropped, so a
// hand-edited URL falls back to "All" instead of an error.
export function validateRecommendationFeedbackSearch(
  search: Record<string, unknown>,
): RecommendationFeedbackSearch {
  return {
    ...validateUsageSearch(search),
    outletId: optionalUuid(search.outletId),
    daypart: optionalFilterText(search.daypart),
    reason: optionalReason(search.reason),
    channelId: optionalUuid(search.channelId),
    runId: optionalUuid(search.runId),
  };
}
