import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import { getBrandCalculationSchedule, updateBrandCalculationSchedule } from "./api";
import type { UpdateBrandCalculationScheduleInput } from "./type";

export const brandCalculationScheduleKeys = {
  detail: (brandId: string) =>
    [...brandKeys.detail(brandId), "calculation-schedule"] as const,
};

export function useBrandCalculationSchedule(brandId: string) {
  return useQuery({
    queryKey: brandCalculationScheduleKeys.detail(brandId),
    queryFn: ({ signal }) => getBrandCalculationSchedule(brandId, signal),
  });
}

export function useUpdateBrandCalculationSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      input,
    }: {
      brandId: string;
      input: UpdateBrandCalculationScheduleInput;
    }) => updateBrandCalculationSchedule(brandId, input),
    onSuccess: (schedule) =>
      queryClient.setQueryData(
        brandCalculationScheduleKeys.detail(schedule.brandId),
        schedule,
      ),
  });
}
