import { apiRequest } from "@/lib/api-client";
import type {
  CreateCustomerItemScoresConfigVersionInput,
  CustomerItemScoresConfigVersion,
} from "./type";

function configPath(brandId: string) {
  return `/brands/${encodeURIComponent(brandId)}/calculation-configs/customer-item-scores`;
}

export async function getCustomerItemScoresConfig(
  brandId: string,
  signal: AbortSignal,
) {
  return apiRequest<CustomerItemScoresConfigVersion>(configPath(brandId), {
    signal,
  });
}

export async function listCustomerItemScoresConfigVersions(
  brandId: string,
  signal: AbortSignal,
) {
  return apiRequest<CustomerItemScoresConfigVersion[]>(
    `${configPath(brandId)}/versions`,
    { signal },
  );
}

// Versions are immutable: the API creates the next version from these changes.
export async function createCustomerItemScoresConfigVersion(
  brandId: string,
  input: CreateCustomerItemScoresConfigVersionInput,
) {
  return apiRequest<CustomerItemScoresConfigVersion>(configPath(brandId), {
    method: "PATCH",
    body: input,
  });
}
