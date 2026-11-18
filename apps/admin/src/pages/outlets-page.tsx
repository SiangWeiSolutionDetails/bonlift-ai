import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/features/auth/permissions";
import { useBrands } from "@/features/brands/queries";
import { CreateOutletDialog } from "@/features/outlets/components/create-outlet-dialog";
import { OutletDialog } from "@/features/outlets/components/outlet-dialog";
import { OutletsTable } from "@/features/outlets/components/outlets-table";
import { useDeleteOutlet, useOutlets } from "@/features/outlets/queries";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";
import type { Outlet, OutletListParams } from "@/features/outlets/type";
import { getErrorMessage } from "@/lib/error-message";
import { filterByName } from "@/lib/filter-by-name";

// Radix Select reserves "" for "no selection", so the "all brands" option needs its own value
const ALL_BRANDS = "all";

export function OutletsPage() {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [outletToDelete, setOutletToDelete] = useState<Outlet | null>(null);
  const deleteOutletMutation = useDeleteOutlet();
  const { canBrand } = usePermissions();
  // Not reset on close, so the title doesn't flip while the dialog animates out
  const [isReadOnly, setIsReadOnly] = useState(false);
  const workspaceBrandId = useWorkspaceBrandId();
  // Starts on the workspace brand; the brand-only rework of this page follows
  const [brandFilter, setBrandFilter] = useState(workspaceBrandId);
  const [searchText, setSearchText] = useState("");

  function openOutlet(outlet: Outlet, readOnly: boolean) {
    setSelectedOutlet(outlet);
    setIsReadOnly(readOnly);
  }

  const listParams: OutletListParams =
    brandFilter === ALL_BRANDS ? {} : { brandId: brandFilter };

  const { data: outlets, isPending, error } = useOutlets(listParams);
  // Feeds the filter, the create dialog and the brand column
  const { data: brands = [] } = useBrands();
  // GET /outlets lists every brand role's outlets; this page shows only brands with outlets.view
  const viewableBrands = brands.filter((brand) => canBrand(brand.id, "outlets.view"));
  const creatableBrands = brands.filter((brand) => canBrand(brand.id, "outlets.create"));
  const filteredOutlets = filterByName(
    outlets?.filter((outlet) => canBrand(outlet.brandId, "outlets.view")),
    searchText,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          creatableBrands.length > 0 && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t("page.newOutlet")}
            </Button>
          )
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
            {viewableBrands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="search"
          className="w-72"
          aria-label={t("search.placeholder")}
          placeholder={t("search.placeholder")}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      {deleteOutletMutation.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(deleteOutletMutation.error, tCommon)}
        </p>
      )}

      <OutletsTable
        outlets={filteredOutlets}
        brands={brands}
        emptyMessage={searchText.trim() ? t("search.noMatches") : undefined}
        isPending={isPending}
        error={error}
        canEdit={(outlet) => canBrand(outlet.brandId, "outlets.edit")}
        canDelete={(outlet) => canBrand(outlet.brandId, "outlets.delete")}
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
        brands={creatableBrands}
        defaultBrandId={
          brandFilter !== ALL_BRANDS && canBrand(brandFilter, "outlets.create") ? brandFilter : undefined
        }
      />
      <OutletDialog
        outlet={selectedOutlet}
        readOnly={isReadOnly}
        onClose={() => setSelectedOutlet(null)}
      />
    </div>
  );
}
