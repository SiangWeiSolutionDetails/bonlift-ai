import type { CustomerScoresSearch } from "@/features/customer-item-scores/search";
import type { ItemAffinitySearch } from "@/features/item-affinity/search";
import type { ResultsSearch } from "@/features/outlet-item-scores/search";
import type { ServeLogEntry } from "./type";

export type ServeRunType = keyof ServeLogEntry["runs"];

export type ServeRunTarget =
  | { to: "/results"; search: ResultsSearch }
  | { to: "/customer-scores"; search: CustomerScoresSearch }
  | { to: "/item-affinity"; search: ItemAffinitySearch };

export type ServeRunLink = {
  type: ServeRunType;
  runId: string;
  available: boolean;
  target: ServeRunTarget;
};

const RUN_TYPES: ServeRunType[] = ["outletScores", "customerScores", "itemAffinity"];
const SHORT_RUN_ID_LENGTH = 8;

// Every search param the page needs is set, so it opens with the run selected and nothing left to pick.
export function runTarget(
  type: ServeRunType,
  brandId: string,
  outletId: string,
  runId: string,
): ServeRunTarget {
  switch (type) {
    case "outletScores":
      return { to: "/results", search: { brandId, outletId, runId } };
    case "customerScores":
      return { to: "/customer-scores", search: { brandId, runId } };
    case "itemAffinity":
      return { to: "/item-affinity", search: { brandId, runId } };
  }
}

export function serveRunLinks(brandId: string, serve: ServeLogEntry): ServeRunLink[] {
  return RUN_TYPES.flatMap((type) => {
    const run = serve.runs[type];
    if (!run) return [];
    return [
      {
        type,
        runId: run.runId,
        available: run.available,
        target: runTarget(type, brandId, serve.outletId, run.runId),
      },
    ];
  });
}

export function shortRunId(runId: string) {
  return runId.slice(0, SHORT_RUN_ID_LENGTH);
}
