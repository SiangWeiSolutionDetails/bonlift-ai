import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import {
  createServingConfigVersion,
  getServingConfig,
  listServingConfigVersions,
} from "./api";
import type { CreateServingConfigVersionInput } from "./type";

export const servingConfigKeys = {
  all: (brandId: string) =>
    [...brandKeys.detail(brandId), "serving-config"] as const,
  latest: (brandId: string) =>
    [...servingConfigKeys.all(brandId), "latest"] as const,
  versions: (brandId: string) =>
    [...servingConfigKeys.all(brandId), "versions"] as const,
};

export function useServingConfig(brandId: string) {
  return useQuery({
    queryKey: servingConfigKeys.latest(brandId),
    queryFn: ({ signal }) => getServingConfig(brandId, signal),
  });
}

export function useServingConfigVersions(brandId: string) {
  return useQuery({
    queryKey: servingConfigKeys.versions(brandId),
    queryFn: ({ signal }) => listServingConfigVersions(brandId, signal),
  });
}

export function useCreateServingConfigVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: CreateServingConfigVersionInput;
    }) => createServingConfigVersion(brandId, input),
    onSuccess: (version) => {
      queryClient.setQueryData(
        servingConfigKeys.latest(version.brandId),
        version,
      );
      return queryClient.invalidateQueries({
        queryKey: servingConfigKeys.versions(version.brandId),
      });
    },
  });
}
