import { addDays as addDaysToDate } from "date-fns";
import { formatDate, parseIsoDate, toIsoDate } from "@/lib/date-format";

export function addDays(date: string, days: number) {
  return toIsoDate(addDaysToDate(parseIsoDate(date), days));
}

export function toCompactDate(date: string) {
  return date.replaceAll("-", "");
}

export function formatWindow(from: string, to: string) {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return null;
  const seconds = (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000;
  return `${seconds.toFixed(seconds < 10 ? 2 : 0)} s`;
}

export function getMaxValue(values: number[]) {
  return Math.max(0, ...values);
}

// Bars are relative to the list's top item, so the 1st-ranked item always fills the column.
export function toBarWidth(value: number, maxValue: number) {
  return maxValue > 0 ? `${(value / maxValue) * 100}%` : "0%";
}

export function formatShare(score: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score);
}
