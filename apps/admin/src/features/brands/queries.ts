import {
  queryOptions,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { meQueryOptions } from "@/features/auth/queries";
import type { BrandListParams, UpdateBrandInput } from "./type";
import {
  createBrand,
  deleteBrand,
  getBrand,
  listBrands,
  updateBrand,
} from "./api";

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

export function brandDetailQueryOptions(brandId: string) {
  return queryOptions({
    queryKey: brandKeys.detail(brandId),
    queryFn: ({ signal }) => getBrand(brandId, signal),
  });
}

export function useBrand(brandId: string | undefined) {
  return useQuery({
    queryKey: brandKeys.detail(brandId ?? ""),
    queryFn: brandId ? brandDetailQueryOptions(brandId).queryFn : skipToken,
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

export function useDeleteBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBrand,
    // The delete cascades to the brand's outlets, and most pages are keyed by brand
    onSuccess: () => queryClient.invalidateQueries(),
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
    // The PATCH response has no tenantName, so the detail is refetched rather than replaced
    onSuccess: (brand) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: brandKeys.detail(brand.id), exact: true }),
        queryClient.invalidateQueries({ queryKey: brandKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey }),
      ]),
  });
}
