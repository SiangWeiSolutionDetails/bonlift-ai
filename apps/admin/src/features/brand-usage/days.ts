import { eachDayOfInterval } from "date-fns";
// Relative, not "@/": the root vitest config has no alias, and this file is unit-tested.
import { parseIsoDate, toIsoDate } from "../../lib/date-format";
import type { BrandUsageDay } from "./type";

function emptyDay(date: string): BrandUsageDay {
  return { date, succeeded: 0, clientErrors: 0, serverErrors: 0, calculationRuns: 0 };
}

// The API returns only days with usage; a chart needs every day, or quiet days vanish and the axis lies.
export function fillUsageDays(days: BrandUsageDay[], from: string, to: string): BrandUsageDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return eachDayOfInterval({ start: parseIsoDate(from), end: parseIsoDate(to) }).map((date) => {
    const isoDate = toIsoDate(date);
    return byDate.get(isoDate) ?? emptyDay(isoDate);
  });
}

// A fixed step keeps date ticks evenly spaced; recharts' own gap logic bunches them up at the end.
export function dayTickInterval(dayCount: number, maxTicks = 8) {
  return Math.max(0, Math.ceil(dayCount / maxTicks) - 1);
}

export type UsageTotals = Omit<BrandUsageDay, "date">;

export function sumUsageDays(days: BrandUsageDay[]): UsageTotals {
  return days.reduce<UsageTotals>(
    (totals, day) => ({
      succeeded: totals.succeeded + day.succeeded,
      clientErrors: totals.clientErrors + day.clientErrors,
      serverErrors: totals.serverErrors + day.serverErrors,
      calculationRuns: totals.calculationRuns + day.calculationRuns,
    }),
    { succeeded: 0, clientErrors: 0, serverErrors: 0, calculationRuns: 0 },
  );
}
