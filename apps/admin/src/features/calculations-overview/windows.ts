import type { BrandCalculationsStartBodySchemaType } from "@bonlift-ai/contracts";
import { addDays, format, parseISO } from "date-fns";
import type { CalculationEntry, CalculationJobType } from "./type";

const toCompactDate = (date: string) => date.replaceAll("-", "");

// ISO YYYY-MM-DD, as the date pickers use
export type DateWindow = { from: string; to: string };
export type DateWindows = Partial<Record<CalculationJobType, DateWindow>>;
export type StartAllBody = BrandCalculationsStartBodySchemaType;

export function scheduleWindow(windowDays: number, windowTo: string): DateWindow {
  // parseISO reads a date-only string as local midnight, so no UTC day shift
  return { from: format(addDays(parseISO(windowTo), -(windowDays - 1)), "yyyy-MM-dd"), to: windowTo };
}

export function scheduleWindows(entries: CalculationEntry[], windowTo: string): DateWindows {
  return Object.fromEntries(entries.map((entry) => [entry.jobType, scheduleWindow(entry.windowDays, windowTo)]));
}

export function isValidWindow(window: DateWindow): boolean {
  return window.from !== "" && window.to !== "" && window.from <= window.to;
}

// Only edited windows are sent, so an untouched calculation keeps following the schedule on the server.
export function toStartAllBody(defaults: DateWindows, edited: DateWindows): StartAllBody {
  const windows: NonNullable<StartAllBody["windows"]> = {};
  for (const [jobType, window] of Object.entries(edited) as [CalculationJobType, DateWindow][]) {
    const fallback = defaults[jobType];
    if (fallback && window.from === fallback.from && window.to === fallback.to) continue;
    windows[jobType] = { from: toCompactDate(window.from), to: toCompactDate(window.to) };
  }
  return Object.keys(windows).length > 0 ? { windows } : {};
}
