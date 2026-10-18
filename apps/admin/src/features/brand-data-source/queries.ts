import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import { getBrandDataSource, updateBrandDataSource } from "./api";
import type { UpdateBrandDataSourceInput } from "./type";

export const brandDataSourceKeys = {
  detail: (brandId: string) =>
    [...brandKeys.detail(brandId), "data-source"] as const,
};

export function useBrandDataSource(brandId: string) {
  return useQuery({
    queryKey: brandDataSourceKeys.detail(brandId ?? ""),
    queryFn: brandId
      ? ({ signal }) => getBrandDataSource(brandId, signal)
      : skipToken,
  });
}

export function useUpdateBrandDataSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: UpdateBrandDataSourceInput;
    }) => updateBrandDataSource(brandId, input),
    onSuccess: (brandDataSource) =>
      queryClient.setQueryData(
        brandDataSourceKeys.detail(brandDataSource.brandId),
        brandDataSource,
      ),
  });
}
