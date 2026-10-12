import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createTenant, getTenant, listTenants, updateTenant } from "./api";
import type { UpdateTenantInput } from "./type";

export const tenantKeys = {
  all: ["tenants"] as const,
  lists: () => [...tenantKeys.all, "list"] as const,
  details: () => [...tenantKeys.all, "detail"] as const,
  detail: (tenantId: string) => [...tenantKeys.details(), tenantId] as const,
};

export function useTenants() {
  return useQuery({
    queryKey: tenantKeys.lists(),
    queryFn: ({ signal }) => listTenants(signal),
  });
}

export function useTenant(tenantId: string | undefined) {
  return useQuery({
    queryKey: tenantKeys.detail(tenantId ?? ""),
    queryFn: tenantId ? ({ signal }) => getTenant(tenantId, signal) : skipToken,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTenant,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tenantKeys.lists() }),
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tenantId,
      input,
    }: {
      tenantId: string;
      input: UpdateTenantInput;
    }) => updateTenant(tenantId, input),
    onSuccess: (tenant) => {
      queryClient.setQueryData(tenantKeys.detail(tenant.id), tenant);
      queryClient.invalidateQueries({ queryKey: tenantKeys.lists() });
    },
  });
}
