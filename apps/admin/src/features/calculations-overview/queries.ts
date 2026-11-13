import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import { customerItemScoresKeys } from "../customer-item-scores/queries";
import { itemAffinityKeys } from "../item-affinity/queries";
import { outletItemScoresKeys } from "../outlet-item-scores/queries";
import { getCalculationsOverview, startAllCalculations } from "./api";
import { shouldPollOverview } from "./overview";

const RUNNING_POLL_MS = 3000;

export const calculationsOverviewKeys = {
  overview: (brandId: string) => [...brandKeys.detail(brandId), "calculations-overview"] as const,
};

// Polls only while something is running, so an idle page makes no requests.
export function useCalculationsOverview(brandId: string | undefined, trackedRunIds: string[]) {
  return useQuery({
    queryKey: calculationsOverviewKeys.overview(brandId ?? ""),
    queryFn: brandId ? ({ signal }) => getCalculationsOverview(brandId, signal) : skipToken,
    refetchInterval: (query) =>
      shouldPollOverview(query.state.data, trackedRunIds) ? RUNNING_POLL_MS : false,
  });
}

export function useStartAllCalculations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (brandId: string) => startAllCalculations(brandId),
    // Awaited, so the overview already holds the new runs when the caller starts tracking them
    onSuccess: (data, brandId) => {
      const outletIds = new Set(data.runs.flatMap((run) => (run.outletId ? [run.outletId] : [])));
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: calculationsOverviewKeys.overview(brandId) }),
        queryClient.invalidateQueries({ queryKey: customerItemScoresKeys.runs(brandId) }),
        queryClient.invalidateQueries({ queryKey: itemAffinityKeys.runs(brandId) }),
        ...[...outletIds].map((outletId) =>
          queryClient.invalidateQueries({ queryKey: outletItemScoresKeys.runs(outletId) }),
        ),
      ]);
    },
    // A 503 still records the runs it could not queue as failed
    onError: (_error, brandId) =>
      queryClient.invalidateQueries({ queryKey: calculationsOverviewKeys.overview(brandId) }),
  });
}
