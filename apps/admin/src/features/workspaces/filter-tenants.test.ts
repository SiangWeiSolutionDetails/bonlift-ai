import { describe, expect, it } from "vitest";
import { filterTenants } from "./filter-tenants";
import type { TenantWorkspaces } from "./workspaces";

function brand(brandId: string, brandName: string, tenantName: string) {
  return { kind: "brand" as const, brandId, brandName, tenantId: tenantName, tenantName, roleName: "Role" };
}

const tenants: TenantWorkspaces[] = [
  { tenantId: "Sakuraya", tenantName: "Sakuraya Foods", brands: [brand("1", "Fish Mart", "Sakuraya Foods"), brand("2", "Ramen Bar", "Sakuraya Foods")] },
  { tenantId: "Other", tenantName: "Other Tenant", brands: [brand("3", "Brand X", "Other Tenant")] },
];

describe("filterTenants", () => {
  it("returns everything for a blank query", () => {
    expect(filterTenants(tenants, "   ")).toEqual(tenants);
  });

  it("matches brand names case-insensitively and drops empty tenants", () => {
    const result = filterTenants(tenants, "  FISH ");
    expect(result.map((t) => t.tenantId)).toEqual(["Sakuraya"]);
    expect(result[0].brands.map((b) => b.brandId)).toEqual(["1"]);
  });

  it("keeps every brand of a tenant whose name matches", () => {
    const result = filterTenants(tenants, "sakuraya");
    expect(result[0].brands.map((b) => b.brandId)).toEqual(["1", "2"]);
    expect(result).toHaveLength(1);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterTenants(tenants, "zzz")).toEqual([]);
  });
});
