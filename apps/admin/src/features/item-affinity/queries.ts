import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getItemAffinityRun,
  getRunItem,
  listItemAffinityRuns,
  listRunItems,
  publishItemAffinityRun,
  startItemAffinityRun,
} from "./api";
import type { ItemAffinityRun, StartRunInput } from "./type";

const RUNNING_POLL_MS = 2000;

export const itemAffinityKeys = {
  all: ["item-affinity"] as const,
  runs: (brandId: string) =>
    [...itemAffinityKeys.all, "runs", brandId] as const,
  run: (runId: string) =>
    [...itemAffinityKeys.all, "run", runId] as const,
  items: (runId: string) =>
    [...itemAffinityKeys.all, "items", runId] as const,
  item: (runId: string, itemId: string) =>
    [...itemAffinityKeys.all, "item", runId, itemId] as const,
};

function hasRunningRun(runs: ItemAffinityRun[] | undefined) {
  return runs?.some((run) => run.status === "running") ?? false;
}

// Polls only while a run is in progress, so an idle page makes no requests.
export function useItemAffinityRuns(brandId: string | undefined) {
  return useQuery({
    queryKey: itemAffinityKeys.runs(brandId ?? ""),
    queryFn: brandId
      ? ({ signal }) => listItemAffinityRuns(brandId, signal)
      : skipToken,
    refetchInterval: (query) =>
      hasRunningRun(query.state.data) ? RUNNING_POLL_MS : false,
  });
}

// For a linked run older than the newest page of the runs list.
export function useItemAffinityRun(runId: string | undefined) {
  return useQuery({
    queryKey: itemAffinityKeys.run(runId ?? ""),
    queryFn: runId ? ({ signal }) => getItemAffinityRun(runId, signal) : skipToken,
    retry: false,
  });
}

// A finished run never changes, so its results are cached for the session.
export function useRunItems(runId: string) {
  return useQuery({
    queryKey: itemAffinityKeys.items(runId),
    queryFn: ({ signal }) => listRunItems(runId, signal),
    staleTime: Infinity,
  });
}

export function useRunItem(runId: string, itemId: string) {
  return useQuery({
    queryKey: itemAffinityKeys.item(runId, itemId),
    queryFn: ({ signal }) => getRunItem(runId, itemId, signal),
    staleTime: Infinity,
  });
}

export function usePublishItemAffinityRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: ItemAffinityRun) =>
      publishItemAffinityRun(run.brandId, run.id),
    onSuccess: (_data, run) =>
      queryClient.invalidateQueries({
        queryKey: itemAffinityKeys.runs(run.brandId),
      }),
  });
}

export function useStartItemAffinityRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: StartRunInput;
    }) => startItemAffinityRun(brandId, input),
    onSuccess: (_data, { brandId }) =>
      queryClient.invalidateQueries({
        queryKey: itemAffinityKeys.runs(brandId),
      }),
  });
}
