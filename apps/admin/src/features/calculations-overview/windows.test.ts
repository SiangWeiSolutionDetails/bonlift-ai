import { describe, expect, it } from "vitest";
import { isValidWindow, scheduleWindow, toStartAllBody } from "./windows";

describe("scheduleWindow", () => {
  it("covers the last N days ending on windowTo, inclusive", () => {
    expect(scheduleWindow(28, "2026-11-15")).toEqual({ from: "2026-10-19", to: "2026-11-15" });
  });

  it("is a single day for a 1-day window", () => {
    expect(scheduleWindow(1, "2026-11-15")).toEqual({ from: "2026-11-15", to: "2026-11-15" });
  });
});

describe("isValidWindow", () => {
  it.each([
    [{ from: "2026-11-01", to: "2026-11-15" }, true],
    [{ from: "2026-11-15", to: "2026-11-15" }, true],
    [{ from: "2026-11-16", to: "2026-11-15" }, false],
    [{ from: "", to: "2026-11-15" }, false],
    [{ from: "2026-11-01", to: "" }, false],
  ])("%o → %s", (window, expected) => {
    expect(isValidWindow(window)).toBe(expected);
  });
});

describe("toStartAllBody", () => {
  const defaults = {
    outlet_item_scores: { from: "2026-10-19", to: "2026-11-15" },
    item_affinity: { from: "2026-08-18", to: "2026-11-15" },
  };

  it("sends no windows when nothing was edited", () => {
    expect(toStartAllBody(defaults, { ...defaults })).toEqual({});
  });

  it("sends only edited windows, as compact dates", () => {
    expect(
      toStartAllBody(defaults, { ...defaults, item_affinity: { from: "2026-11-01", to: "2026-11-15" } }),
    ).toEqual({ windows: { item_affinity: { from: "20261101", to: "20261115" } } });
  });
});
