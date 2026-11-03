import { format, parseISO } from "date-fns";
import { enUS, zhCN, type Locale } from "date-fns/locale";
import type { Language } from "@/i18n/languages";

// One display format for the whole app, whatever the UI language.
const DISPLAY_DATE = "dd/MM/yyyy";
const DISPLAY_SHORT_DATE = "dd/MM";
const DISPLAY_TIME = "hh:mm:ss a";
const DISPLAY_DATE_TIME = `${DISPLAY_DATE} ${DISPLAY_TIME}`;
const ISO_DATE = "yyyy-MM-dd";

const CALENDAR_LOCALES: Record<Language, Locale> = { en: enUS, "zh-CN": zhCN };

// parseISO reads a bare "YYYY-MM-DD" as local midnight, so a business date never shifts a day;
// timestamps with an offset are shown in the viewer's local time.
function toDate(value: string | Date) {
  return typeof value === "string" ? parseISO(value) : value;
}

export function formatDate(value: string | Date) {
  return format(toDate(value), DISPLAY_DATE);
}

// For tight spaces such as chart axes, where the year is shown elsewhere.
export function formatShortDate(value: string | Date) {
  return format(toDate(value), DISPLAY_SHORT_DATE);
}

export function formatTime(value: string | Date) {
  return format(toDate(value), DISPLAY_TIME);
}

export function formatDateTime(value: string | Date) {
  return format(toDate(value), DISPLAY_DATE_TIME);
}

export function toIsoDate(date: Date) {
  return format(date, ISO_DATE);
}

export function parseIsoDate(value: string) {
  return parseISO(value);
}

// Month and weekday names in the calendar follow the UI language; the date format does not.
export function calendarLocale(language: string) {
  return CALENDAR_LOCALES[language as Language] ?? enUS;
}
