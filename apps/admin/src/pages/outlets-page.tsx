import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrands } from "@/features/brands/queries";
import { CreateOutletDialog } from "@/features/outlets/components/create-outlet-dialog";
import { OutletDialog } from "@/features/outlets/components/outlet-dialog";
import { OutletsTable } from "@/features/outlets/components/outlets-table";
import { useDeleteOutlet, useOutlets } from "@/features/outlets/queries";
import type { Outlet, OutletListParams } from "@/features/outlets/type";
import { getErrorMessage } from "@/lib/error-message";

// Radix Select reserves "" for "no selection", so the "all brands" option needs its own value
const ALL_BRANDS = "all";

export function OutletsPage() {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [outletToDelete, setOutletToDelete] = useState<Outlet | null>(null);
  const deleteOutletMutation = useDeleteOutlet();
  // Not reset on close, so the title doesn't flip while the dialog animates out
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [brandFilter, setBrandFilter] = useState(ALL_BRANDS);

  function openOutlet(outlet: Outlet, readOnly: boolean) {
    setSelectedOutlet(outlet);
    setIsReadOnly(readOnly);
  }

  const listParams: OutletListParams =
    brandFilter === ALL_BRANDS ? {} : { brandId: brandFilter };

  const { data: outlets, isPending, error } = useOutlets(listParams);
  // Feeds the filter, the create dialog and the brand column
  const { data: brands = [] } = useBrands();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          <Button onClick={() => setIsCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("page.newOutlet")}
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <Label htmlFor="outlet-brand-filter" className="shrink-0">
          {t("filter.brand")}
        </Label>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger id="outlet-brand-filter" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_BRANDS}>{t("filter.allBrands")}</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {deleteOutletMutation.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(deleteOutletMutation.error, tCommon)}
        </p>
      )}

      <OutletsTable
        outlets={outlets}
        brands={brands}
        isPending={isPending}
        error={error}
        onEdit={(outlet) => openOutlet(outlet, false)}
        onView={(outlet) => openOutlet(outlet, true)}
        onDelete={setOutletToDelete}
      />

      <ConfirmDialog
        open={outletToDelete !== null}
        title={t("delete.title", { name: outletToDelete?.name })}
        description={t("delete.description")}
        confirmLabel={tCommon("actions.delete")}
        confirmMatch={outletToDelete?.name}
        onCancel={() => setOutletToDelete(null)}
        onConfirm={() =>
          outletToDelete && deleteOutletMutation.mutate(outletToDelete.id)
        }
      />

      <CreateOutletDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        brands={brands}
        defaultBrandId={brandFilter === ALL_BRANDS ? undefined : brandFilter}
      />
      <OutletDialog
        outlet={selectedOutlet}
        readOnly={isReadOnly}
        onClose={() => setSelectedOutlet(null)}
      />
    </div>
  );
}
