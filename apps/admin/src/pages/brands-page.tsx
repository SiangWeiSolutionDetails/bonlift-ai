import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/auth/permissions";
import { useCurrentUser } from "@/features/auth/queries";
import { BrandsTable } from "@/features/brands/components/brands-table";
import { CreateBrandDialog } from "@/features/brands/components/create-brand-dialog";
import { BrandDialog } from "@/features/brands/components/brand-dialog";
import type { Brand } from "@/features/brands/type";
import { useBrands, useDeleteBrand } from "@/features/brands/queries";
import { useTenants } from "@/features/tenants/queries";
import { getErrorMessage } from "@/lib/error-message";
import { filterByName } from "@/lib/filter-by-name";

// Without tenants.view, GET /tenants is refused, so the tenants come from the user's own brands
function useTenantOptions() {
  const me = useCurrentUser();
  const { canConsole } = usePermissions();
  const canViewTenants = canConsole("tenants.view");
  const { data: tenants = [] } = useTenants({ enabled: canViewTenants });
  if (canViewTenants) return tenants;
  const names = new Map(me.brands.map((brand) => [brand.tenantId, brand.tenantName]));
  return [...names].map(([id, name]) => ({ id, name }));
}

export function BrandsPage() {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);
  const deleteBrandMutation = useDeleteBrand();
  const { canConsole } = usePermissions();
  const me = useCurrentUser();
  // Not reset on close, so the title doesn't flip while the dialog animates out
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [searchText, setSearchText] = useState("");

  function openBrand(brand: Brand, readOnly: boolean) {
    setSelectedBrandId(brand.id);
    setIsReadOnly(readOnly);
  }

  const { data: brands, error, isPending } = useBrands();
  const tenants = useTenantOptions();
  // Derived from the list so the open dialog sees saved changes
  const selectedBrand =
    brands?.find((brand) => brand.id === selectedBrandId) ?? null;
  const filteredBrands = filterByName(brands, searchText);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canConsole("brands.create") && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t("page.newBrand")}
            </Button>
          )
        }
      />

      <Input
        type="search"
        className="w-72"
        aria-label={t("search.placeholder")}
        placeholder={t("search.placeholder")}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />

      {deleteBrandMutation.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(deleteBrandMutation.error, tCommon)}
        </p>
      )}

      <BrandsTable
        brands={filteredBrands}
        tenants={tenants}
        isPending={isPending}
        error={error}
        emptyMessage={searchText.trim() ? t("search.noMatches") : undefined}
        canEdit={() => canConsole("brands.edit")}
        canOpenWorkspace={(brand) => me.brands.some((b) => b.brandId === brand.id)}
        onEdit={(brand) => openBrand(brand, false)}
        onView={(brand) => openBrand(brand, true)}
        onDelete={canConsole("brands.delete") ? setBrandToDelete : undefined}
      />

      <ConfirmDialog
        open={brandToDelete !== null}
        title={t("delete.title", { name: brandToDelete?.name })}
        description={t("delete.description")}
        confirmLabel={tCommon("actions.delete")}
        confirmMatch={brandToDelete?.name}
        onCancel={() => setBrandToDelete(null)}
        onConfirm={() =>
          brandToDelete && deleteBrandMutation.mutate(brandToDelete.id)
        }
      />

      <CreateBrandDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        tenants={tenants}
      />
      <BrandDialog
        brand={selectedBrand}
        tenantName={tenants.find((tenant) => tenant.id === selectedBrand?.tenantId)?.name}
        readOnly={isReadOnly}
        onClose={() => setSelectedBrandId(null)}
      />
    </div>
  );
}
