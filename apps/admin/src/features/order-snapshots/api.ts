import { apiRequest } from "@/lib/api-client";
import type { OrderSnapshotCoverage } from "./type";

export async function getOrderSnapshotCoverage(
  outletId: string,
  signal: AbortSignal,
) {
  return apiRequest<OrderSnapshotCoverage>(
    `/outlets/${encodeURIComponent(outletId)}/order-snapshots`,
    { signal },
  );
}
