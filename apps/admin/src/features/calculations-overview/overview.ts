import { joinCalculations } from "./registry";
import type {
  CalculationEntry,
  CalculationJobType,
  CalculationOutlet,
  CalculationRun,
  CalculationRunStatus,
  CalculationsOverview,
} from "./type";

const STALE_AFTER_DAYS = 1;

export function runStatusById(overview: CalculationsOverview) {
  const statuses = new Map<string, CalculationRunStatus>();
  for (const entry of overview.calculations) {
    const runs = [
      entry.latestRun,
      entry.publishedRun,
      ...entry.outlets.flatMap((outlet) => [outlet.latestRun, outlet.publishedRun]),
    ];
    for (const run of runs) {
      if (run) statuses.set(run.id, run.status);
    }
  }
  return statuses;
}

export function shouldPollOverview(
  overview: CalculationsOverview | undefined,
  trackedRunIds: string[],
) {
  if (!overview) return false;
  if (overview.calculations.some((entry) => entry.runningRuns > 0)) return true;
  const statuses = runStatusById(overview);
  return trackedRunIds.some((runId) => statuses.get(runId) === "running");
}

export type RunProgress = {
  total: number;
  finished: number;
  failed: number;
};

// A started run missing from the overview has been replaced by a newer latest run, so it is no longer running.
export function countRunProgress(
  overview: CalculationsOverview,
  trackedRunIds: string[],
): RunProgress {
  const statuses = runStatusById(overview);
  const tracked = trackedRunIds.map((runId) => statuses.get(runId));
  return {
    total: tracked.length,
    finished: tracked.filter((status) => status !== "running").length,
    failed: tracked.filter((status) => status === "failed").length,
  };
}

export type OutletStatusCounts = Record<CalculationRunStatus | "neverRun", number> & {
  published: number;
  total: number;
};

export function countOutletStatuses(outlets: CalculationOutlet[]): OutletStatusCounts {
  const counts: OutletStatusCounts = {
    running: 0,
    succeeded: 0,
    failed: 0,
    neverRun: 0,
    published: 0,
    total: outlets.length,
  };
  for (const outlet of outlets) {
    counts[outlet.latestRun?.status ?? "neverRun"] += 1;
    if (outlet.publishedRun) counts.published += 1;
  }
  return counts;
}

export type RunFailure = { outletName: string | null; error: string | null };

export type Insight =
  | { kind: "latestRunFailed"; jobType: CalculationJobType; failures: RunFailure[] }
  | { kind: "recentFailures"; jobType: CalculationJobType; count: number }
  | { kind: "noPublishedResults"; jobType: CalculationJobType; outletNames: string[] }
  | { kind: "noOrdersInWindow"; jobType: CalculationJobType; outletNames: string[] }
  | { kind: "staleResults"; jobType: CalculationJobType; days: number };

const INSIGHT_ORDER: Insight["kind"][] = [
  "latestRunFailed",
  "recentFailures",
  "noPublishedResults",
  "noOrdersInWindow",
  "staleResults",
];

function latestRunFailures(entry: CalculationEntry): RunFailure[] {
  if (entry.scope === "brand") {
    return entry.latestRun?.status === "failed"
      ? [{ outletName: null, error: entry.latestRun.error }]
      : [];
  }
  return entry.outlets.flatMap((outlet) =>
    outlet.isActive && outlet.latestRun?.status === "failed"
      ? [{ outletName: outlet.outletName, error: outlet.latestRun.error }]
      : [],
  );
}

function activeOutletNames(outlets: CalculationOutlet[], matches: (outlet: CalculationOutlet) => boolean) {
  return outlets.filter((outlet) => outlet.isActive && matches(outlet)).map((outlet) => outlet.outletName);
}

// Only what needs attention: every insight with nothing to report is left out.
export function deriveInsights(overview: CalculationsOverview): Insight[] {
  const insights = joinCalculations(overview.calculations).flatMap(({ entry }): Insight[] => {
    const { jobType } = entry;
    const failures = latestRunFailures(entry);
    const noPublished = activeOutletNames(entry.outlets, (outlet) => !outlet.publishedRun);
    const brandUnpublished = entry.scope === "brand" && !entry.publishedRun;
    const noOrders = activeOutletNames(entry.outlets, (outlet) => !outlet.hasOrdersInWindow);
    const candidates: (Insight | false)[] = [
      failures.length > 0 && { kind: "latestRunFailed", jobType, failures },
      entry.failedRunsLast7Days > 0 && {
        kind: "recentFailures",
        jobType,
        count: entry.failedRunsLast7Days,
      },
      (noPublished.length > 0 || brandUnpublished) && {
        kind: "noPublishedResults",
        jobType,
        outletNames: noPublished,
      },
      noOrders.length > 0 && { kind: "noOrdersInWindow", jobType, outletNames: noOrders },
      entry.resultsAgeDays !== null &&
        entry.resultsAgeDays > STALE_AFTER_DAYS && {
          kind: "staleResults",
          jobType,
          days: entry.resultsAgeDays,
        },
    ];
    return candidates.filter((insight): insight is Insight => insight !== false);
  });
  return insights.sort((a, b) => INSIGHT_ORDER.indexOf(a.kind) - INSIGHT_ORDER.indexOf(b.kind));
}

export function latestFinishedRun(entry: CalculationEntry) {
  // The published run counts too: while a newer run is still running, it is the last one that finished
  const runs =
    entry.scope === "brand"
      ? [entry.latestRun, entry.publishedRun]
      : entry.outlets.flatMap((outlet) => [outlet.latestRun, outlet.publishedRun]);
  let latest: CalculationRun | null = null;
  for (const run of runs) {
    if (!run?.finishedAt) continue;
    if (!latest?.finishedAt || Date.parse(run.finishedAt) > Date.parse(latest.finishedAt)) latest = run;
  }
  return latest;
}

// Current state, not history: each scope (an outlet, or a brand-level calculation) counts once, by its latest run,
// so the totals add up the status badges shown in the sections.
export type OverviewTotals = Record<CalculationRunStatus | "neverRun", number> & { scopes: number };

export function summarizeOverview(overview: CalculationsOverview): OverviewTotals {
  const totals: OverviewTotals = { running: 0, succeeded: 0, failed: 0, neverRun: 0, scopes: 0 };
  for (const { entry } of joinCalculations(overview.calculations)) {
    const statuses =
      entry.scope === "outlet"
        ? entry.outlets.map((outlet) => outlet.latestRun?.status)
        : [entry.latestRun?.status];
    for (const status of statuses) {
      totals[status ?? "neverRun"] += 1;
      totals.scopes += 1;
    }
  }
  return totals;
}

export type RunAllPhase = "nothingToStart" | "running" | "succeeded" | "failed";

export function runAllPhase(progress: RunProgress): RunAllPhase {
  if (progress.total === 0) return "nothingToStart";
  if (progress.finished < progress.total) return "running";
  return progress.failed > 0 ? "failed" : "succeeded";
}
