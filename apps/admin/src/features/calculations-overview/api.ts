import { apiRequest } from "@/lib/api-client";
import type { CalculationsOverview, StartAllResponse } from "./type";
import type { StartAllBody } from "./windows";

export async function getCalculationsOverview(brandId: string, signal: AbortSignal) {
  return apiRequest<CalculationsOverview>(
    `/brands/${encodeURIComponent(brandId)}/calculations/overview`,
    { signal },
  );
}

export async function startAllCalculations(brandId: string, body: StartAllBody) {
  return apiRequest<StartAllResponse>(`/calculate/all/${encodeURIComponent(brandId)}`, {
    method: "POST",
    body,
  });
}
