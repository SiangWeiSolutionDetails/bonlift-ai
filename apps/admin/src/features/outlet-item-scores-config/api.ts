import { apiRequest } from "@/lib/api-client";
import type {
  CreateOutletItemScoresConfigVersionInput,
  OutletItemScoresConfigVersion,
} from "./type";

function configPath(brandId: string) {
  return `/brands/${encodeURIComponent(brandId)}/calculation-configs/outlet-item-scores`;
}

export async function getOutletItemScoresConfig(
  brandId: string,
  signal: AbortSignal,
) {
  return apiRequest<OutletItemScoresConfigVersion>(configPath(brandId), {
    signal,
  });
}

export async function listOutletItemScoresConfigVersions(
  brandId: string,
  signal: AbortSignal,
) {
  return apiRequest<OutletItemScoresConfigVersion[]>(
    `${configPath(brandId)}/versions`,
    { signal },
  );
}

// Versions are immutable: the API creates the next version from these changes.
export async function createOutletItemScoresConfigVersion(
  brandId: string,
  input: CreateOutletItemScoresConfigVersionInput,
) {
  return apiRequest<OutletItemScoresConfigVersion>(configPath(brandId), {
    method: "PATCH",
    body: input,
  });
}
