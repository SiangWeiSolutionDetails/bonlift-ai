import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import {
  createOutletItemScoresConfigVersion,
  getOutletItemScoresConfig,
  listOutletItemScoresConfigVersions,
} from "./api";
import type { CreateOutletItemScoresConfigVersionInput } from "./type";

export const outletItemScoresConfigKeys = {
  all: (brandId: string) =>
    [...brandKeys.detail(brandId), "outlet-item-scores-config"] as const,
  latest: (brandId: string) =>
    [...outletItemScoresConfigKeys.all(brandId), "latest"] as const,
  versions: (brandId: string) =>
    [...outletItemScoresConfigKeys.all(brandId), "versions"] as const,
};

export function useOutletItemScoresConfig(brandId: string) {
  return useQuery({
    queryKey: outletItemScoresConfigKeys.latest(brandId ?? ""),
    queryFn: brandId
      ? ({ signal }) => getOutletItemScoresConfig(brandId, signal)
      : skipToken,
  });
}

export function useOutletItemScoresConfigVersions(brandId: string) {
  return useQuery({
    queryKey: outletItemScoresConfigKeys.versions(brandId ?? ""),
    queryFn: brandId
      ? ({ signal }) => listOutletItemScoresConfigVersions(brandId, signal)
      : skipToken,
  });
}

export function useCreateOutletItemScoresConfigVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: CreateOutletItemScoresConfigVersionInput;
    }) => createOutletItemScoresConfigVersion(brandId, input),
    onSuccess: (version) => {
      queryClient.setQueryData(
        outletItemScoresConfigKeys.latest(version.brandId),
        version,
      );
      return queryClient.invalidateQueries({
        queryKey: outletItemScoresConfigKeys.versions(version.brandId),
      });
    },
  });
}
