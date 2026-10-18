import { apiRequest } from "@/lib/api-client";
import type { BrandDataSource, UpdateBrandDataSourceInput } from "./type";

export async function getBrandDataSource(brandId: string, signal: AbortSignal) {
  return apiRequest<BrandDataSource>(
    `/brands/${encodeURIComponent(brandId)}/data-source`,
    {
      signal,
    },
  );
}

export async function updateBrandDataSource(
  brandId: string,
  input: UpdateBrandDataSourceInput,
) {
  return apiRequest<BrandDataSource>(
    `/brands/${encodeURIComponent(brandId)}/data-source`,
    {
      method: "PATCH",
      body: input,
    },
  );
}
