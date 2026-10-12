import { apiRequest } from "@/lib/api-client";
import type { CreateTenantInput, Tenant, UpdateTenantInput } from "./type";

export async function listTenants(signal: AbortSignal) {
  const data = await apiRequest<{ tenants: Tenant[] }>("/tenants", {
    signal,
  });
  return data.tenants;
}

export async function getTenant(tenantId: string, signal: AbortSignal) {
  return await apiRequest(`/tenants/${encodeURIComponent(tenantId)}`, {
    signal,
  });
}

export async function createTenant(input: CreateTenantInput) {
  return await apiRequest<Tenant>("/tenants", {
    method: "POST",
    body: input,
  });
}

export async function updateTenant(tenantId: string, input: UpdateTenantInput) {
  return await apiRequest<Tenant>(`/tenants/${encodeURIComponent(tenantId)}`, {
    method: "PATCH",
    body: input,
  });
}
