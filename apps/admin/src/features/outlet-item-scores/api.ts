import { apiRequest } from "@/lib/api-client";
import type {
  OutletItemScoresRun,
  OutletItemScoresRunResult,
  StartRunInput,
  StartRunResponse,
} from "./type";

export async function listOutletItemScoresRuns(
  outletId: string,
  signal: AbortSignal,
) {
  const data = await apiRequest<{ runs: OutletItemScoresRun[] }>(
    `/outlets/${encodeURIComponent(outletId)}/runs/outlet-item-scores`,
    { signal },
  );
  return data.runs;
}

export async function getOutletItemScoresRunResult(
  runId: string,
  signal: AbortSignal,
) {
  return apiRequest<OutletItemScoresRunResult>(
    `/runs/${encodeURIComponent(runId)}/outlet-item-scores`,
    { signal },
  );
}

export async function publishOutletItemScoresRun(outletId: string, runId: string) {
  return apiRequest<OutletItemScoresRun>(
    `/outlets/${encodeURIComponent(outletId)}/published-runs/outlet-item-scores`,
    { method: "PUT", body: { runId } },
  );
}

export async function startOutletItemScoresRun(
  outletId: string,
  input: StartRunInput,
) {
  return apiRequest<StartRunResponse>(
    `/calculate/outlet-item-scores/${encodeURIComponent(outletId)}`,
    { method: "POST", query: input },
  );
}
