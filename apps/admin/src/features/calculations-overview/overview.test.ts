import { describe, expect, it } from "vitest";
import {
  countOutletStatuses,
  countRunProgress,
  deriveInsights,
  latestFinishedRun,
  shouldPollOverview,
  runAllPhase,
  summarizeOverview,
} from "./overview";
import { joinCalculations } from "./registry";
import type {
  CalculationEntry,
  CalculationOutlet,
  CalculationRun,
  CalculationRunStatus,
  CalculationsOverview,
} from "./type";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";

function run(id: string, status: CalculationRunStatus, overrides: Partial<CalculationRun> = {}): CalculationRun {
  return {
    id,
    status,
    triggerType: "manual",
    from: "2026-10-12",
    to: "2026-11-10",
    rowCount: status === "succeeded" ? 10 : null,
    error: status === "failed" ? "boom" : null,
    startedAt: "2026-11-11T01:00:00.000Z",
    finishedAt: status === "running" ? null : "2026-11-11T01:00:05.000Z",
    ...overrides,
  };
}

function outlet(name: string, overrides: Partial<CalculationOutlet> = {}): CalculationOutlet {
  return {
    outletId: `outlet-${name}`,
    outletName: name,
    isActive: true,
    hasOrdersInWindow: true,
    latestRun: null,
    publishedRun: null,
    ...overrides,
  };
}

function entry(overrides: Partial<CalculationEntry> = {}): CalculationEntry {
  return {
    jobType: "customer_item_scores",
    scope: "brand",
    windowDays: 30,
    latestRun: null,
    publishedRun: null,
    outlets: [],
    runningRuns: 0,
    failedRunsLast7Days: 0,
    resultsAgeDays: 0,
    metrics: { subjects: 0, rows: 0 },
    ...overrides,
  };
}

function overview(calculations: CalculationEntry[]): CalculationsOverview {
  return {
    brandId: BRAND_ID,
    timeZone: "Asia/Singapore",
    windowTo: "2026-11-10",
    calculations,
    topPairs: [],
    topItems: [],
  };
}

describe("joinCalculations", () => {
  it("keeps registry order and drops job types the admin doesn't know", () => {
    const joined = joinCalculations([
      entry({ jobType: "item_affinity" }),
      entry({ jobType: "future_calculation" as CalculationEntry["jobType"] }),
      entry({ jobType: "outlet_item_scores", scope: "outlet" }),
    ]);

    expect(joined.map(({ entry }) => entry.jobType)).toEqual(["outlet_item_scores", "item_affinity"]);
  });
});

describe("shouldPollOverview", () => {
  it("polls while any calculation has a running run", () => {
    expect(shouldPollOverview(overview([entry({ runningRuns: 1 })]), [])).toBe(true);
  });

  it("polls while a tracked run is still running", () => {
    const data = overview([entry({ latestRun: run("run-1", "running") })]);

    expect(shouldPollOverview(data, ["run-1"])).toBe(true);
  });

  it("stops once everything has finished", () => {
    const data = overview([entry({ latestRun: run("run-1", "succeeded") })]);

    expect(shouldPollOverview(data, ["run-1"])).toBe(false);
  });

  it("does not poll before the first response", () => {
    expect(shouldPollOverview(undefined, ["run-1"])).toBe(false);
  });
});

describe("countRunProgress", () => {
  it("counts brand and outlet runs by whether they finished", () => {
    const data = overview([
      entry({ latestRun: run("brand-run", "failed") }),
      entry({
        jobType: "outlet_item_scores",
        scope: "outlet",
        outlets: [
          outlet("A", { latestRun: run("outlet-a", "succeeded") }),
          outlet("B", { latestRun: run("outlet-b", "running") }),
        ],
      }),
    ]);

    expect(countRunProgress(data, ["brand-run", "outlet-a", "outlet-b"])).toEqual({
      total: 3,
      finished: 2,
      failed: 1,
    });
  });

  it("counts a run replaced by a newer latest run as finished", () => {
    const data = overview([entry({ latestRun: run("newer-run", "running") })]);

    expect(countRunProgress(data, ["older-run"])).toEqual({ total: 1, finished: 1, failed: 0 });
  });
});

describe("countOutletStatuses", () => {
  it("counts latest run statuses, never-run outlets and published outlets", () => {
    const counts = countOutletStatuses([
      outlet("A", { latestRun: run("a", "succeeded"), publishedRun: run("a", "succeeded") }),
      outlet("B", { latestRun: run("b", "failed") }),
      outlet("C"),
    ]);

    expect(counts).toEqual({ running: 0, succeeded: 1, failed: 1, neverRun: 1, published: 1, total: 3 });
  });
});

describe("latestFinishedRun", () => {
  it("picks the outlet run that finished last", () => {
    const later = run("later", "succeeded", { finishedAt: "2026-11-11T03:00:00.000Z" });
    const data = entry({
      scope: "outlet",
      outlets: [
        outlet("A", { latestRun: run("earlier", "succeeded") }),
        outlet("B", { latestRun: later }),
        outlet("C", { latestRun: run("running", "running") }),
      ],
    });

    expect(latestFinishedRun(data)?.id).toBe("later");
  });

  it("falls back to the published run while a newer run is still running", () => {
    const data = entry({ latestRun: run("new", "running"), publishedRun: run("old", "succeeded") });

    expect(latestFinishedRun(data)?.id).toBe("old");
  });

  it("is null when nothing has finished", () => {
    expect(latestFinishedRun(entry({ latestRun: run("r", "running") }))).toBeNull();
  });
});

describe("deriveInsights", () => {
  it("reports nothing for a healthy brand", () => {
    const data = overview([
      entry({ latestRun: run("r", "succeeded"), publishedRun: run("r", "succeeded"), resultsAgeDays: 1 }),
    ]);

    expect(deriveInsights(data)).toEqual([]);
  });

  it("lists failures first, then outlet gaps, then stale results", () => {
    const data = overview([
      entry({
        jobType: "outlet_item_scores",
        scope: "outlet",
        resultsAgeDays: 4,
        outlets: [
          outlet("A", { latestRun: run("a", "failed"), publishedRun: run("old", "succeeded") }),
          outlet("B", { hasOrdersInWindow: false }),
          outlet("Closed", { isActive: false, hasOrdersInWindow: false }),
        ],
      }),
      entry({ jobType: "item_affinity", failedRunsLast7Days: 2 }),
    ]);

    expect(deriveInsights(data)).toEqual([
      {
        kind: "latestRunFailed",
        jobType: "outlet_item_scores",
        failures: [{ outletName: "A", error: "boom" }],
      },
      { kind: "recentFailures", jobType: "item_affinity", count: 2 },
      { kind: "noPublishedResults", jobType: "outlet_item_scores", outletNames: ["B"] },
      { kind: "noPublishedResults", jobType: "item_affinity", outletNames: [] },
      { kind: "noOrdersInWindow", jobType: "outlet_item_scores", outletNames: ["B"] },
      { kind: "staleResults", jobType: "outlet_item_scores", days: 4 },
    ]);
  });

  it("reports a failed brand-level latest run with its error", () => {
    const data = overview([
      entry({
        latestRun: run("r", "failed", { error: "no orders" }),
        publishedRun: run("old", "succeeded"),
      }),
    ]);

    expect(deriveInsights(data)).toEqual([
      {
        kind: "latestRunFailed",
        jobType: "customer_item_scores",
        failures: [{ outletName: null, error: "no orders" }],
      },
    ]);
  });

  it("reports a brand-level calculation that has never published", () => {
    const data = overview([entry({ jobType: "item_affinity", resultsAgeDays: null })]);

    expect(deriveInsights(data)).toEqual([
      { kind: "noPublishedResults", jobType: "item_affinity", outletNames: [] },
    ]);
  });
});

describe("summarizeOverview", () => {
  it("adds up failed runs and takes the oldest published results", () => {
    const data = overview([
      entry({ jobType: "outlet_item_scores", scope: "outlet", runningRuns: 2, failedRunsLast7Days: 1, resultsAgeDays: 3 }),
      entry({ jobType: "customer_item_scores", runningRuns: 1, resultsAgeDays: 0 }),
      entry({ jobType: "item_affinity", failedRunsLast7Days: 2, resultsAgeDays: null }),
    ]);

    expect(summarizeOverview(data)).toEqual({ failedRunsLast7Days: 3, oldestResultsAgeDays: 3 });
  });

  it("has no oldest age when nothing is published", () => {
    const data = overview([entry({ resultsAgeDays: null })]);

    expect(summarizeOverview(data).oldestResultsAgeDays).toBeNull();
  });
});

describe("runAllPhase", () => {
  it.each([
    [{ total: 0, finished: 0, failed: 0 }, "nothingToStart"],
    [{ total: 3, finished: 1, failed: 1 }, "running"],
    [{ total: 3, finished: 3, failed: 0 }, "succeeded"],
    [{ total: 3, finished: 3, failed: 1 }, "failed"],
  ] as const)("%o → %s", (progress, expected) => {
    expect(runAllPhase(progress)).toBe(expected);
  });
});
