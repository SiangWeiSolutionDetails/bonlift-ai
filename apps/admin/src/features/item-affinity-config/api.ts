import { apiRequest } from "@/lib/api-client";
import type {
  CreateItemAffinityConfigVersionInput,
  ItemAffinityConfigVersion,
} from "./type";

function configPath(brandId: string) {
  return `/brands/${encodeURIComponent(brandId)}/calculation-configs/item-affinity`;
}

export async function getItemAffinityConfig(
  brandId: string,
  signal: AbortSignal,
) {
  return apiRequest<ItemAffinityConfigVersion>(configPath(brandId), {
    signal,
  });
}

export async function listItemAffinityConfigVersions(
  brandId: string,
  signal: AbortSignal,
) {
  return apiRequest<ItemAffinityConfigVersion[]>(
    `${configPath(brandId)}/versions`,
    { signal },
  );
}

// Versions are immutable: the API creates the next version from these changes.
export async function createItemAffinityConfigVersion(
  brandId: string,
  input: CreateItemAffinityConfigVersionInput,
) {
  return apiRequest<ItemAffinityConfigVersion>(configPath(brandId), {
    method: "PATCH",
    body: input,
  });
}
