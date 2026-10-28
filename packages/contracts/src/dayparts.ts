import type { DaypartSchemaType } from "./outletItemScoresCalculationConfigVersion.schema.js";

// An empty dayparts list means one whole-day list stored under this name.
export const ALL_DAY_DAYPART = "all_day";

// Rules that compare dayparts with each other, which the schema cannot express. Shared by the API and the admin UI.
export type DaypartIssue =
  | { code: "reservedName"; name: string }
  | { code: "sameStartEnd"; name: string }
  | { code: "duplicateName"; name: string }
  | { code: "overlap"; first: string; second: string };

const MINUTES_PER_DAY = 24 * 60;

interface MinuteRange {
  name: string;
  start: number;
  end: number;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Half-open [start, end) ranges; a daypart with start > end crosses midnight and becomes two ranges.
function toRanges(daypart: DaypartSchemaType): MinuteRange[] {
  const start = toMinutes(daypart.start);
  const end = toMinutes(daypart.end);

  if (start < end) {
    return [{ name: daypart.name, start, end }];
  }

  return [
    { name: daypart.name, start, end: MINUTES_PER_DAY },
    { name: daypart.name, start: 0, end },
  ].filter((range) => range.start < range.end);
}

function findDuplicateName(dayparts: DaypartSchemaType[]): string | null {
  const seen = new Set<string>();
  for (const { name } of dayparts) {
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return null;
}

function findOverlap(
  dayparts: DaypartSchemaType[],
): { first: string; second: string } | null {
  const ranges = dayparts.flatMap(toRanges).sort((a, b) => a.start - b.start);

  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) {
      return { first: ranges[i - 1].name, second: ranges[i].name };
    }
  }
  return null;
}

export function findDaypartIssue(
  dayparts: DaypartSchemaType[],
): DaypartIssue | null {
  for (const { name, start, end } of dayparts) {
    if (name === ALL_DAY_DAYPART) return { code: "reservedName", name };
    if (start === end) return { code: "sameStartEnd", name };
  }

  const duplicate = findDuplicateName(dayparts);
  if (duplicate !== null) return { code: "duplicateName", name: duplicate };

  const overlap = findOverlap(dayparts);
  if (overlap !== null) return { code: "overlap", ...overlap };

  return null;
}
