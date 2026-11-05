import type { BrandApiKeyListSchemaType } from "@bonlift-ai/contracts";
import { apiRequest } from "@/lib/api-client";
import type {
  BrandApiKey,
  CreateBrandApiKeyInput,
  CreatedBrandApiKey,
} from "./type";

function apiKeysPath(brandId: string) {
  return `/brands/${encodeURIComponent(brandId)}/api-keys`;
}

export async function listBrandApiKeys(brandId: string, signal: AbortSignal) {
  const { apiKeys } = await apiRequest<BrandApiKeyListSchemaType>(
    apiKeysPath(brandId),
    { signal },
  );
  return apiKeys;
}

// The only call whose response carries the secret.
export async function createBrandApiKey(
  brandId: string,
  input: CreateBrandApiKeyInput,
) {
  return apiRequest<CreatedBrandApiKey>(apiKeysPath(brandId), {
    method: "POST",
    body: input,
  });
}

// Only revoked or expired keys; the API answers 409 for a live key.
export async function deleteBrandApiKey(brandId: string, keyId: string) {
  return apiRequest<void>(
    `${apiKeysPath(brandId)}/${encodeURIComponent(keyId)}`,
    { method: "DELETE" },
  );
}

export async function revokeBrandApiKey(brandId: string, keyId: string) {
  return apiRequest<BrandApiKey>(
    `${apiKeysPath(brandId)}/${encodeURIComponent(keyId)}/revoke`,
    { method: "POST" },
  );
}
