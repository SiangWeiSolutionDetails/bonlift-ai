import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getRunCustomer,
  listCustomerItemScoresRuns,
  listRunCustomers,
  publishCustomerItemScoresRun,
  startCustomerItemScoresRun,
} from "./api";
import type { CustomerItemScoresRun, StartRunInput } from "./type";

const RUNNING_POLL_MS = 2000;

export const customerItemScoresKeys = {
  all: ["customer-item-scores"] as const,
  runs: (brandId: string) =>
    [...customerItemScoresKeys.all, "runs", brandId] as const,
  customers: (runId: string, search: string | undefined) =>
    [...customerItemScoresKeys.all, "customers", runId, search] as const,
  customer: (runId: string, customerId: string) =>
    [...customerItemScoresKeys.all, "customer", runId, customerId] as const,
};

function hasRunningRun(runs: CustomerItemScoresRun[] | undefined) {
  return runs?.some((run) => run.status === "running") ?? false;
}

// Polls only while a run is in progress, so an idle page makes no requests.
export function useCustomerItemScoresRuns(brandId: string | undefined) {
  return useQuery({
    queryKey: customerItemScoresKeys.runs(brandId ?? ""),
    queryFn: brandId
      ? ({ signal }) => listCustomerItemScoresRuns(brandId, signal)
      : skipToken,
    refetchInterval: (query) =>
      hasRunningRun(query.state.data) ? RUNNING_POLL_MS : false,
  });
}

// A finished run never changes, so its results are cached for the session.
export function useRunCustomers(runId: string, search: string | undefined) {
  return useInfiniteQuery({
    queryKey: customerItemScoresKeys.customers(runId, search),
    queryFn: ({ pageParam, signal }) =>
      listRunCustomers(runId, { after: pageParam, search }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextAfter ?? undefined,
    staleTime: Infinity,
  });
}

export function useRunCustomer(runId: string, customerId: string) {
  return useQuery({
    queryKey: customerItemScoresKeys.customer(runId, customerId),
    queryFn: ({ signal }) => getRunCustomer(runId, customerId, signal),
    staleTime: Infinity,
  });
}

export function usePublishCustomerItemScoresRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: CustomerItemScoresRun) =>
      publishCustomerItemScoresRun(run.brandId, run.id),
    onSuccess: (_data, run) =>
      queryClient.invalidateQueries({
        queryKey: customerItemScoresKeys.runs(run.brandId),
      }),
  });
}

export function useStartCustomerItemScoresRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: StartRunInput;
    }) => startCustomerItemScoresRun(brandId, input),
    onSuccess: (_data, { brandId }) =>
      queryClient.invalidateQueries({
        queryKey: customerItemScoresKeys.runs(brandId),
      }),
  });
}
