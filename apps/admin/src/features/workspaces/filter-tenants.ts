import type { TenantWorkspaces } from "./workspaces";

export function filterTenants(tenants: TenantWorkspaces[], query: string): TenantWorkspaces[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tenants;
  const matches = (text: string) => text.toLowerCase().includes(needle);
  return tenants
    .map((tenant) =>
      matches(tenant.tenantName) ? tenant : { ...tenant, brands: tenant.brands.filter((b) => matches(b.brandName)) },
    )
    .filter((tenant) => tenant.brands.length > 0);
}
