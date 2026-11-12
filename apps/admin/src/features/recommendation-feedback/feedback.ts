import { differenceInCalendarDays } from "date-fns";
// Relative, not "@/": the root vitest config has no alias, and this file is unit-tested.
import { parseIsoDate } from "../../lib/date-format";
import type { FeedbackDay, ServedItem, ServedItemOutcome } from "./type";

export const FEEDBACK_REASONS = ["frequently_ordered", "popular_at_outlet"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

// Stack order of the daily chart, bottom to top, and column order of the tables.
export const OUTCOMES = ["accepted", "rejected", "ignored", "awaiting"] as const satisfies
  readonly ServedItemOutcome[];

// The API's own cap; checking it here saves a request that can only fail.
export const MAX_RANGE_DAYS = 366;

const OUTCOME_BADGE_VARIANTS = {
  accepted: "success",
  rejected: "destructive",
  ignored: "secondary",
  awaiting: "outline",
} as const satisfies Record<ServedItemOutcome, string>;

export function outcomeBadgeVariant(outcome: ServedItemOutcome) {
  return OUTCOME_BADGE_VARIANTS[outcome];
}

export function isKnownReason(reason: string): reason is FeedbackReason {
  return FEEDBACK_REASONS.includes(reason as FeedbackReason);
}

// null means nothing has an outcome yet, which is no rate rather than a 0% one.
export function formatRate(rate: number | null, locale: string) {
  if (rate === null) return "—";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(rate);
}

export function isRangeTooLong(from: string, to: string, maxDays = MAX_RANGE_DAYS) {
  return differenceInCalendarDays(parseIsoDate(to), parseIsoDate(from)) + 1 > maxDays;
}

// Only the topmost visible segment gets the rounded end, so every bar has one whatever its mix.
export function topOutcome(day: FeedbackDay): ServedItemOutcome | undefined {
  return OUTCOMES.findLast((outcome) => day[outcome] > 0);
}

export function sortByRank(items: ServedItem[]) {
  return items.toSorted((a, b) => a.rank - b.rank);
}

// With a daypart filter on, the report lists only that daypart, so the selection is kept as an option to switch back.
export function daypartOptions(reportDayparts: string[], selected: string | undefined) {
  const options = new Set(reportDayparts);
  if (selected) options.add(selected);
  return [...options];
}
