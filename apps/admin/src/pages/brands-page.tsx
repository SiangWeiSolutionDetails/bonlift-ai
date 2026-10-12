import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BrandsTable } from "@/features/brands/components/brands-table";
import { CreateBrandDialog } from "@/features/brands/components/create-brand-dialog";
import { EditBrandDialog } from "@/features/brands/components/edit-brand-dialog";
import type { Brand } from "@/features/brands/type";
import { useBrands } from "@/features/brands/queries";
import { useTenants } from "@/features/tenants/queries";

export function BrandsPage() {
  const { t } = useTranslation("brands");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

  const { data: brands, error, isPending } = useBrands();
  const { data: tenants = [] } = useTenants();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        action={
          <Button onClick={() => setIsCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("page.newBrand")}
          </Button>
        }
      />

      <BrandsTable
        brands={brands}
        isPending={isPending}
        error={error}
        onEdit={setEditingBrand}
      />

      <CreateBrandDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        tenants={tenants}
      />
      <EditBrandDialog
        brand={editingBrand}
        onClose={() => setEditingBrand(null)}
      />
    </div>
  );
}
