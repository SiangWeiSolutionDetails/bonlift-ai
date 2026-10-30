import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getOutletItemScoresRunResult,
  listOutletItemScoresRuns,
  startOutletItemScoresRun,
} from "./api";
import type { OutletItemScoresRun, StartRunInput } from "./type";

const RUNNING_POLL_MS = 2000;

export const outletItemScoresKeys = {
  all: ["outlet-item-scores"] as const,
  runs: (outletId: string) =>
    [...outletItemScoresKeys.all, "runs", outletId] as const,
  result: (runId: string) =>
    [...outletItemScoresKeys.all, "result", runId] as const,
};

function hasRunningRun(runs: OutletItemScoresRun[] | undefined) {
  return runs?.some((run) => run.status === "running") ?? false;
}

// Polls only while a run is in progress, so an idle page makes no requests.
export function useOutletItemScoresRuns(outletId: string | undefined) {
  return useQuery({
    queryKey: outletItemScoresKeys.runs(outletId ?? ""),
    queryFn: outletId
      ? ({ signal }) => listOutletItemScoresRuns(outletId, signal)
      : skipToken,
    refetchInterval: (query) =>
      hasRunningRun(query.state.data) ? RUNNING_POLL_MS : false,
  });
}

// A finished run never changes, so its result is cached for the session.
export function useOutletItemScoresRunResult(
  runId: string | undefined,
  status: OutletItemScoresRun["status"] | undefined,
) {
  return useQuery({
    queryKey: [...outletItemScoresKeys.result(runId ?? ""), status],
    queryFn: runId
      ? ({ signal }) => getOutletItemScoresRunResult(runId, signal)
      : skipToken,
    staleTime: status === "running" ? 0 : Infinity,
  });
}

export function useStartOutletItemScoresRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      outletId,
      input,
    }: {
      outletId: string;
      input: StartRunInput;
    }) => startOutletItemScoresRun(outletId, input),
    onSuccess: (_data, { outletId }) =>
      queryClient.invalidateQueries({
        queryKey: outletItemScoresKeys.runs(outletId),
      }),
  });
}
