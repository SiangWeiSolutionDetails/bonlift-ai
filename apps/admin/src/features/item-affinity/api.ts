import { apiRequest } from "@/lib/api-client";
import type {
  AffinityItemList,
  AffinityItemResult,
  ItemAffinityRun,
  StartRunInput,
  StartRunResponse,
} from "./type";

export async function listItemAffinityRuns(
  brandId: string,
  signal: AbortSignal,
) {
  const data = await apiRequest<{ runs: ItemAffinityRun[] }>(
    `/brands/${encodeURIComponent(brandId)}/runs/item-affinity`,
    { signal },
  );
  return data.runs;
}

export async function getItemAffinityRun(runId: string, signal: AbortSignal) {
  return apiRequest<ItemAffinityRun>(
    `/runs/${encodeURIComponent(runId)}/item-affinity`,
    { signal },
  );
}

export async function publishItemAffinityRun(brandId: string, runId: string) {
  return apiRequest<ItemAffinityRun>(
    `/brands/${encodeURIComponent(brandId)}/published-runs/item-affinity`,
    { method: "PUT", body: { runId } },
  );
}

export async function startItemAffinityRun(
  brandId: string,
  input: StartRunInput,
) {
  return apiRequest<StartRunResponse>(
    `/calculate/item-affinity/${encodeURIComponent(brandId)}`,
    { method: "POST", query: input },
  );
}

export async function listRunItems(runId: string, signal: AbortSignal) {
  const data = await apiRequest<AffinityItemList>(
    `/runs/${encodeURIComponent(runId)}/item-affinity/items`,
    { signal },
  );
  return data.items;
}

export async function getRunItem(
  runId: string,
  itemId: string,
  signal: AbortSignal,
) {
  return apiRequest<AffinityItemResult>(
    `/runs/${encodeURIComponent(runId)}/item-affinity/items/${encodeURIComponent(itemId)}`,
    { signal },
  );
}
