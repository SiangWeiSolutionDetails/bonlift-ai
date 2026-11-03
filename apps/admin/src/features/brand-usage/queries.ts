import { useQuery } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import { getBrandUsage } from "./api";

// Days are counted in the viewer's time zone, so a Singapore viewer's "1 Nov" is Singapore's 1 Nov.
const VIEWER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const brandUsageKeys = {
  range: (brandId: string, from: string, to: string, tz: string) =>
    [...brandKeys.detail(brandId), "usage", { from, to, tz }] as const,
};

export function useBrandUsage(brandId: string, from: string, to: string) {
  return useQuery({
    queryKey: brandUsageKeys.range(brandId, from, to, VIEWER_TIME_ZONE),
    queryFn: ({ signal }) =>
      getBrandUsage(brandId, { from, to, tz: VIEWER_TIME_ZONE }, signal),
  });
}
