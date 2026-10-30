import { addDays as addDaysToDate } from "date-fns";
import { formatDate, parseIsoDate, toIsoDate } from "@/lib/date-format";

export function addDays(date: string, days: number) {
  return toIsoDate(addDaysToDate(parseIsoDate(date), days));
}

export function toCompactDate(date: string) {
  return date.replaceAll("-", "");
}

// Runs store a half-open window [from, to); people read the last day included.
export function formatWindow(from: string, to: string) {
  return `${formatDate(from)} – ${formatDate(addDays(to, -1))}`;
}

export function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return null;
  const seconds = (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000;
  return `${seconds.toFixed(seconds < 10 ? 2 : 0)} s`;
}

export function formatShare(score: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score);
}
