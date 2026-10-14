import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  OutletListParams,
  UpdateOutletInput,
} from "./type";
import { createOutlet, getOutlet, listOutlets, updateOutlet } from "./api";

const outletKeys = {
  all: ["outlets"] as const,
  lists: () => [...outletKeys.all, "list"] as const,
  list: (params: OutletListParams) => [...outletKeys.lists(), params] as const,
  details: () => [...outletKeys.all, "detail"] as const,
  detail: (outletId: string) => [...outletKeys.details(), outletId] as const,
};

export function useOutlets(params: OutletListParams) {
  return useQuery({
    queryKey: outletKeys.list(params),
    queryFn: ({ signal }) => listOutlets(params, signal),
  });
}

export function useOutlet(outletId: string) {
  return useQuery({
    queryKey: outletKeys.detail(outletId ?? ""),
    queryFn: outletId ? ({ signal }) => getOutlet(outletId, signal) : skipToken,
  });
}

export function useCreateOutlet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOutlet,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: outletKeys.lists() }),
  });
}

export function useUpdateOutlet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      outletId,
      input,
    }: {
      outletId: string;
      input: UpdateOutletInput;
    }) => updateOutlet(outletId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: outletKeys.lists() }),
  });
}
