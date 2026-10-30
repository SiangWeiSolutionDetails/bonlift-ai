import { skipToken, useQuery } from "@tanstack/react-query";
import { getOrderSnapshot, getOrderSnapshotCoverage } from "./api";

export const orderSnapshotsKeys = {
  all: ["order-snapshots"] as const,
  coverage: (outletId: string) =>
    [...orderSnapshotsKeys.all, "coverage", outletId] as const,
  snapshot: (outletId: string, date: string) =>
    [...orderSnapshotsKeys.all, "snapshot", outletId, date] as const,
};

export function useOrderSnapshotCoverage(outletId: string | undefined) {
  return useQuery({
    queryKey: orderSnapshotsKeys.coverage(outletId ?? ""),
    queryFn: outletId
      ? ({ signal }) => getOrderSnapshotCoverage(outletId, signal)
      : skipToken,
  });
}

// A day's raw orders can be large and include customer ids, so nothing is kept once the dialog closes.
export function useOrderSnapshot(outletId: string, date: string | undefined) {
  return useQuery({
    queryKey: orderSnapshotsKeys.snapshot(outletId, date ?? ""),
    queryFn: date
      ? ({ signal }) => getOrderSnapshot(outletId, date, signal)
      : skipToken,
    gcTime: 0,
  });
}
