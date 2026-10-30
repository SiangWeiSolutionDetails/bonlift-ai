import { apiRequest } from "@/lib/api-client";
import type { OrderSnapshot, OrderSnapshotCoverage } from "./type";

export async function getOrderSnapshotCoverage(
  outletId: string,
  signal: AbortSignal,
) {
  return apiRequest<OrderSnapshotCoverage>(
    `/outlets/${encodeURIComponent(outletId)}/order-snapshots`,
    { signal },
  );
}

export async function getOrderSnapshot(
  outletId: string,
  date: string,
  signal: AbortSignal,
) {
  return apiRequest<OrderSnapshot>(
    `/outlets/${encodeURIComponent(outletId)}/order-snapshots/${encodeURIComponent(date)}`,
    { signal },
  );
}
