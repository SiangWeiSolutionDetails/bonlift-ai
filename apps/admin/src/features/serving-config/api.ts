import { apiRequest } from "@/lib/api-client";
import type {
  CreateServingConfigVersionInput,
  ServingConfigVersion,
} from "./type";

function configPath(brandId: string) {
  return `/brands/${encodeURIComponent(brandId)}/serving-config`;
}

export async function getServingConfig(brandId: string, signal: AbortSignal) {
  return apiRequest<ServingConfigVersion>(configPath(brandId), { signal });
}

export async function listServingConfigVersions(
  brandId: string,
  signal: AbortSignal,
) {
  return apiRequest<ServingConfigVersion[]>(`${configPath(brandId)}/versions`, {
    signal,
  });
}

// Versions are immutable: the API creates the next version from these changes.
export async function createServingConfigVersion(
  brandId: string,
  input: CreateServingConfigVersionInput,
) {
  return apiRequest<ServingConfigVersion>(configPath(brandId), {
    method: "PATCH",
    body: input,
  });
}
