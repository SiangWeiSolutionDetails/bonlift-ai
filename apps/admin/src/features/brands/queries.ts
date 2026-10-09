import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { BrandListParams, UpdateBrandInput } from "./type";
import { createBrand, getBrand, listBrands, updateBrand } from "./api";

export const brandKeys = {
  all: ["brands"] as const,
  lists: () => [...brandKeys.all, "list"] as const,
  list: (params: BrandListParams) => [...brandKeys.lists(), params] as const,
  details: () => [...brandKeys.all, "detail"] as const,
  detail: (brandId: string) => [...brandKeys.details(), brandId] as const,
};

export function useBrands(params: BrandListParams = {}) {
  return useQuery({
    queryKey: brandKeys.list(params),
    queryFn: ({ signal }) => listBrands(params, signal),
  });
}

export function useBrand(brandId: string | undefined) {
  return useQuery({
    queryKey: brandKeys.detail(brandId ?? ""),
    queryFn: brandId ? ({ signal }) => getBrand(brandId, signal) : skipToken,
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBrand,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: brandKeys.lists() }),
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: UpdateBrandInput;
    }) => updateBrand(brandId, input),
    onSuccess: (brand) => {
      queryClient.setQueryData(brandKeys.detail(brand.id), brand);
      return queryClient.invalidateQueries({ queryKey: brandKeys.lists() });
    },
  });
}
