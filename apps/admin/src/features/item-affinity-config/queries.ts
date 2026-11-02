import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import {
  createItemAffinityConfigVersion,
  getItemAffinityConfig,
  listItemAffinityConfigVersions,
} from "./api";
import type { CreateItemAffinityConfigVersionInput } from "./type";

export const itemAffinityConfigKeys = {
  all: (brandId: string) =>
    [...brandKeys.detail(brandId), "item-affinity-config"] as const,
  latest: (brandId: string) =>
    [...itemAffinityConfigKeys.all(brandId), "latest"] as const,
  versions: (brandId: string) =>
    [...itemAffinityConfigKeys.all(brandId), "versions"] as const,
};

export function useItemAffinityConfig(brandId: string) {
  return useQuery({
    queryKey: itemAffinityConfigKeys.latest(brandId),
    queryFn: ({ signal }) => getItemAffinityConfig(brandId, signal),
  });
}

export function useItemAffinityConfigVersions(brandId: string) {
  return useQuery({
    queryKey: itemAffinityConfigKeys.versions(brandId),
    queryFn: ({ signal }) => listItemAffinityConfigVersions(brandId, signal),
  });
}

export function useCreateItemAffinityConfigVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: CreateItemAffinityConfigVersionInput;
    }) => createItemAffinityConfigVersion(brandId, input),
    onSuccess: (version) => {
      queryClient.setQueryData(
        itemAffinityConfigKeys.latest(version.brandId),
        version,
      );
      return queryClient.invalidateQueries({
        queryKey: itemAffinityConfigKeys.versions(version.brandId),
      });
    },
  });
}
