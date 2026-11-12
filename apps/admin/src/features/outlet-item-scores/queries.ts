import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getOutletItemScoresRunResult,
  listOutletItemScoresRuns,
  publishOutletItemScoresRun,
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
  run: (runId: string) =>
    [...outletItemScoresKeys.all, "run", runId] as const,
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

// For a linked run older than the newest page of the runs list. There is no run-only endpoint, so the result is
// fetched once and seeded into the cache entry the ranking card reads.
export function useOutletItemScoresRun(runId: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: outletItemScoresKeys.run(runId ?? ""),
    queryFn: runId
      ? async ({ signal }) => {
          const result = await getOutletItemScoresRunResult(runId, signal);
          queryClient.setQueryData(
            [...outletItemScoresKeys.result(runId), result.run.status],
            result,
          );
          return result.run;
        }
      : skipToken,
    retry: false,
  });
}

export function usePublishOutletItemScoresRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: OutletItemScoresRun) =>
      publishOutletItemScoresRun(run.outletId, run.id),
    onSuccess: (_data, run) =>
      queryClient.invalidateQueries({
        queryKey: outletItemScoresKeys.runs(run.outletId),
      }),
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
