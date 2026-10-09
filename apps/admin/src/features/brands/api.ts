import { apiRequest } from "@/lib/api-client";
import type {
  Brand,
  BrandListParams,
  CreateBrandInput,
  UpdateBrandInput,
} from "./type";

export async function listBrands(
  params: BrandListParams,
  signal?: AbortSignal,
) {
  const data = await apiRequest<{ brands: Brand[] }>("/brands", {
    query: params,
    signal,
  });
  return data.brands;
}

export async function getBrand(brandId: string, signal?: AbortSignal) {
  return apiRequest<Brand>(`/brands/${encodeURIComponent(brandId)}`, {
    signal,
  });
}

export async function createBrand(input: CreateBrandInput) {
  return apiRequest<Brand>("/brands", { method: "POST", body: input });
}

export async function updateBrand(brandId: string, input: UpdateBrandInput) {
  return apiRequest<Brand>(`/brands/${encodeURIComponent(brandId)}`, {
    method: "PATCH",
    body: input,
  });
}
