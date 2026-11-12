import { describe, expect, it } from "vitest";
import {
  daypartOptions,
  formatRate,
  isKnownReason,
  isRangeTooLong,
  outcomeBadgeVariant,
  sortByRank,
  topOutcome,
} from "./feedback";

const day = (counts: Partial<Record<"accepted" | "rejected" | "ignored" | "awaiting", number>>) => ({
  date: "2026-11-01",
  servedItems: 0,
  accepted: 0,
  rejected: 0,
  ignored: 0,
  awaiting: 0,
  acceptanceRate: null,
  ...counts,
});

const item = (itemId: string, rank: number) => ({
  itemId,
  label: itemId,
  rank,
  reason: "popular_at_outlet",
  outcome: "ignored" as const,
});

describe("formatRate", () => {
  it("shows a dash when there is no rate", () => {
    expect(formatRate(null, "en")).toBe("—");
  });

  it.each([
    [0, "0%"],
    [0.5, "50%"],
    [1 / 3, "33.3%"],
    [1, "100%"],
  ])("formats %d as %s", (rate, text) => {
    expect(formatRate(rate, "en")).toBe(text);
  });
});

describe("outcomeBadgeVariant", () => {
  it.each([
    ["accepted", "success"],
    ["rejected", "destructive"],
    ["ignored", "secondary"],
    ["awaiting", "outline"],
  ] as const)("shows %s as %s", (outcome, variant) => {
    expect(outcomeBadgeVariant(outcome)).toBe(variant);
  });
});

describe("isKnownReason", () => {
  it("knows the reasons the API serves and nothing else", () => {
    expect(isKnownReason("frequently_ordered")).toBe(true);
    expect(isKnownReason("popular_at_outlet")).toBe(true);
    expect(isKnownReason("goes_with_cart")).toBe(false);
  });
});

describe("isRangeTooLong", () => {
  it("allows exactly the maximum, counting both ends", () => {
    expect(isRangeTooLong("2026-01-01", "2026-01-03", 3)).toBe(false);
    expect(isRangeTooLong("2026-01-01", "2026-01-04", 3)).toBe(true);
  });

  it("allows a full leap year of 366 days", () => {
    expect(isRangeTooLong("2028-01-01", "2028-12-31")).toBe(false);
    expect(isRangeTooLong("2027-12-31", "2028-12-31")).toBe(true);
  });
});

describe("topOutcome", () => {
  it("picks the highest outcome in stack order that has items", () => {
    expect(topOutcome(day({ accepted: 2, ignored: 1 }))).toBe("ignored");
    expect(topOutcome(day({ accepted: 2, awaiting: 1 }))).toBe("awaiting");
  });

  it("has no top on an empty day", () => {
    expect(topOutcome(day({}))).toBeUndefined();
  });
});

describe("sortByRank", () => {
  it("orders items by rank without changing the input", () => {
    const items = [item("b", 2), item("a", 1), item("c", 3)];

    expect(sortByRank(items).map((i) => i.itemId)).toEqual(["a", "b", "c"]);
    expect(items.map((i) => i.itemId)).toEqual(["b", "a", "c"]);
  });
});

describe("daypartOptions", () => {
  it("keeps the selected daypart when the report no longer lists it", () => {
    expect(daypartOptions(["lunch"], "dinner")).toEqual(["lunch", "dinner"]);
  });

  it("lists each daypart once", () => {
    expect(daypartOptions(["lunch", "dinner"], "lunch")).toEqual(["lunch", "dinner"]);
  });
});
