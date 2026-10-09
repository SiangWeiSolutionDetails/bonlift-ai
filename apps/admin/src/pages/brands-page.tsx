import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { Tenant } from "@/features/tenants/type";
import { BrandsTable } from "@/features/brands/components/brands-table";
import { CreateBrandDialog } from "@/features/brands/components/create-brand-dialog";
import { EditBrandDialog } from "@/features/brands/components/edit-brand-dialog";
import type { Brand } from "@/features/brands/type";

export function BrandsPage() {
  const { t } = useTranslation("brands");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

  // IMPLEMENT: replace these three with `useBrands()`.
  const brands: Brand[] | undefined = [];
  const isPending = false;
  const error = null as Error | null;

  // IMPLEMENT: replace with a tenants query (needs features/tenants/api.ts + queries.ts).
  const tenants: Tenant[] = [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.description")}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          {t("page.newBrand")}
        </Button>
      </div>

      <BrandsTable
        brands={brands}
        isPending={isPending}
        error={error}
        onEdit={setEditingBrand}
      />

      <CreateBrandDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} tenants={tenants} />
      <EditBrandDialog brand={editingBrand} onClose={() => setEditingBrand(null)} />
    </div>
  );
}
