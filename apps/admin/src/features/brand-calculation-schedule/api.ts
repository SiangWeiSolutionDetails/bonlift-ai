import { apiRequest } from "@/lib/api-client";
import type {
  BrandCalculationSchedule,
  UpdateBrandCalculationScheduleInput,
} from "./type";

export async function getBrandCalculationSchedule(brandId: string, signal: AbortSignal) {
  return apiRequest<BrandCalculationSchedule>(
    `/brands/${encodeURIComponent(brandId)}/calculation-schedule`,
    { signal },
  );
}

export async function updateBrandCalculationSchedule(
  brandId: string,
  input: UpdateBrandCalculationScheduleInput,
) {
  return apiRequest<BrandCalculationSchedule>(
    `/brands/${encodeURIComponent(brandId)}/calculation-schedule`,
    { method: "PATCH", body: input },
  );
}
