import type { BrandUsageQuerySchemaType } from "@bonlift-ai/contracts";
import { apiRequest } from "@/lib/api-client";
import type { BrandUsage } from "./type";

export async function getBrandUsage(
  brandId: string,
  query: BrandUsageQuerySchemaType,
  signal: AbortSignal,
) {
  return apiRequest<BrandUsage>(`/brands/${encodeURIComponent(brandId)}/usage`, {
    query,
    signal,
  });
}
