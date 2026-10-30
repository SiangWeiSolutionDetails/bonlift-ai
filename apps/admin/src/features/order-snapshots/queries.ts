import { skipToken, useQuery } from "@tanstack/react-query";
import { getOrderSnapshotCoverage } from "./api";

export const orderSnapshotsKeys = {
  all: ["order-snapshots"] as const,
  coverage: (outletId: string) =>
    [...orderSnapshotsKeys.all, "coverage", outletId] as const,
};

export function useOrderSnapshotCoverage(outletId: string | undefined) {
  return useQuery({
    queryKey: orderSnapshotsKeys.coverage(outletId ?? ""),
    queryFn: outletId
      ? ({ signal }) => getOrderSnapshotCoverage(outletId, signal)
      : skipToken,
  });
}
