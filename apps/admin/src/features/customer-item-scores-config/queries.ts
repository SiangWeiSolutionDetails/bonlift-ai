import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import {
  createCustomerItemScoresConfigVersion,
  getCustomerItemScoresConfig,
  listCustomerItemScoresConfigVersions,
} from "./api";
import type { CreateCustomerItemScoresConfigVersionInput } from "./type";

export const customerItemScoresConfigKeys = {
  all: (brandId: string) =>
    [...brandKeys.detail(brandId), "customer-item-scores-config"] as const,
  latest: (brandId: string) =>
    [...customerItemScoresConfigKeys.all(brandId), "latest"] as const,
  versions: (brandId: string) =>
    [...customerItemScoresConfigKeys.all(brandId), "versions"] as const,
};

export function useCustomerItemScoresConfig(brandId: string) {
  return useQuery({
    queryKey: customerItemScoresConfigKeys.latest(brandId),
    queryFn: ({ signal }) => getCustomerItemScoresConfig(brandId, signal),
  });
}

export function useCustomerItemScoresConfigVersions(brandId: string) {
  return useQuery({
    queryKey: customerItemScoresConfigKeys.versions(brandId),
    queryFn: ({ signal }) =>
      listCustomerItemScoresConfigVersions(brandId, signal),
  });
}

export function useCreateCustomerItemScoresConfigVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: CreateCustomerItemScoresConfigVersionInput;
    }) => createCustomerItemScoresConfigVersion(brandId, input),
    onSuccess: (version) => {
      queryClient.setQueryData(
        customerItemScoresConfigKeys.latest(version.brandId),
        version,
      );
      return queryClient.invalidateQueries({
        queryKey: customerItemScoresConfigKeys.versions(version.brandId),
      });
    },
  });
}
