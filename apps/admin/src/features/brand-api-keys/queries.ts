import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import {
  createBrandApiKey,
  deleteBrandApiKey,
  listBrandApiKeys,
  revokeBrandApiKey,
} from "./api";
import type { CreateBrandApiKeyInput } from "./type";

export const brandApiKeyKeys = {
  list: (brandId: string) => [...brandKeys.detail(brandId), "api-keys"] as const,
};

export function useBrandApiKeys(brandId: string) {
  return useQuery({
    queryKey: brandApiKeyKeys.list(brandId),
    queryFn: ({ signal }) => listBrandApiKeys(brandId, signal),
  });
}

// gcTime 0: the response carries the secret, so the mutation cache must not keep it after the dialog
// takes its copy. The list is refetched instead of patched, so the secret never enters the query cache.
export function useCreateBrandApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: CreateBrandApiKeyInput;
    }) => createBrandApiKey(brandId, input),
    onSuccess: (created) =>
      queryClient.invalidateQueries({
        queryKey: brandApiKeyKeys.list(created.brandId),
      }),
  });
}

export function useDeleteBrandApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, keyId }: { brandId: string; keyId: string }) =>
      deleteBrandApiKey(brandId, keyId),
    onSuccess: (_, { brandId }) =>
      queryClient.invalidateQueries({ queryKey: brandApiKeyKeys.list(brandId) }),
  });
}

export function useRevokeBrandApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, keyId }: { brandId: string; keyId: string }) =>
      revokeBrandApiKey(brandId, keyId),
    onSuccess: (revoked) =>
      queryClient.invalidateQueries({
        queryKey: brandApiKeyKeys.list(revoked.brandId),
      }),
  });
}
