import { describe, expect, it } from "vitest";
import { dayTickInterval, fillUsageDays, sumUsageDays } from "./days";

const day = (date: string, succeeded: number, calculationRuns = 0) => ({
  date,
  succeeded,
  clientErrors: 0,
  serverErrors: 0,
  calculationRuns,
});

describe("fillUsageDays", () => {
  it("adds zero days between, before and after the days with usage", () => {
    const filled = fillUsageDays([day("2026-11-02", 5)], "2026-11-01", "2026-11-03");

    expect(filled.map((d) => [d.date, d.succeeded])).toEqual([
      ["2026-11-01", 0],
      ["2026-11-02", 5],
      ["2026-11-03", 0],
    ]);
  });

  it("returns one zero day per date when there is no usage", () => {
    expect(fillUsageDays([], "2026-11-01", "2026-11-02")).toHaveLength(2);
  });

  it("crosses a month end", () => {
    const filled = fillUsageDays([], "2026-10-31", "2026-11-01");

    expect(filled.map((d) => d.date)).toEqual(["2026-10-31", "2026-11-01"]);
  });
});

describe("dayTickInterval", () => {
  it.each([
    [1, 0],
    [8, 0],
    [9, 1],
    [14, 1],
    [30, 3],
  ])("skips %i days down to at most 8 ticks (interval %i)", (dayCount, interval) => {
    expect(dayTickInterval(dayCount)).toBe(interval);
  });
});

describe("sumUsageDays", () => {
  it("adds every count across days", () => {
    expect(sumUsageDays([day("2026-11-01", 2, 1), day("2026-11-02", 3, 4)])).toMatchObject({
      succeeded: 5,
      calculationRuns: 5,
    });
  });
});
