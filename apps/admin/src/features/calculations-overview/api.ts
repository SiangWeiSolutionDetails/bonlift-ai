import { apiRequest } from "@/lib/api-client";
import type { CalculationsOverview, StartAllResponse } from "./type";

export async function getCalculationsOverview(brandId: string, signal: AbortSignal) {
  return apiRequest<CalculationsOverview>(
    `/brands/${encodeURIComponent(brandId)}/calculations/overview`,
    { signal },
  );
}

export async function startAllCalculations(brandId: string) {
  return apiRequest<StartAllResponse>(`/calculate/all/${encodeURIComponent(brandId)}`, {
    method: "POST",
  });
}
