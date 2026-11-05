import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BrandsTable } from "@/features/brands/components/brands-table";
import { CreateBrandDialog } from "@/features/brands/components/create-brand-dialog";
import { BrandDialog } from "@/features/brands/components/brand-dialog";
import type { Brand } from "@/features/brands/type";
import { useBrands } from "@/features/brands/queries";
import { useTenants } from "@/features/tenants/queries";

export function BrandsPage() {
  const { t } = useTranslation("brands");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  // Not reset on close, so the title doesn't flip while the dialog animates out
  const [isReadOnly, setIsReadOnly] = useState(false);

  function openBrand(brand: Brand, readOnly: boolean) {
    setSelectedBrandId(brand.id);
    setIsReadOnly(readOnly);
  }

  const { data: brands, error, isPending } = useBrands();
  const { data: tenants = [] } = useTenants();
  // Derived from the list so the open dialog sees saved changes
  const selectedBrand =
    brands?.find((brand) => brand.id === selectedBrandId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          <Button onClick={() => setIsCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("page.newBrand")}
          </Button>
        }
      />

      <BrandsTable
        brands={brands}
        tenants={tenants}
        isPending={isPending}
        error={error}
        onEdit={(brand) => openBrand(brand, false)}
        onView={(brand) => openBrand(brand, true)}
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
