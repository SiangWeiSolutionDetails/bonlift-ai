import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { EditOutletDialog } from "@/features/outlets/components/edit-outlet-dialog";
import { OutletsTable } from "@/features/outlets/components/outlets-table";
import { useOutlets } from "@/features/outlets/queries";
import type { Outlet, OutletListParams } from "@/features/outlets/type";

// Radix Select reserves "" for "no selection", so the "all brands" option needs its own value
const ALL_BRANDS = "all";

export function OutletsPage() {
  const { t } = useTranslation("outlets");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [brandFilter, setBrandFilter] = useState(ALL_BRANDS);

  const listParams: OutletListParams =
    brandFilter === ALL_BRANDS ? {} : { brandId: brandFilter };

  const { data: outlets, isPending, error } = useOutlets(listParams);
  // Feeds the filter, the create dialog and the brand column
  const { data: brands = [] } = useBrands();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
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

      <OutletsTable
        outlets={outlets}
        brands={brands}
        isPending={isPending}
        error={error}
        onEdit={setEditingOutlet}
      />

      <CreateOutletDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        brands={brands}
        defaultBrandId={brandFilter === ALL_BRANDS ? undefined : brandFilter}
      />
      <EditOutletDialog outlet={editingOutlet} onClose={() => setEditingOutlet(null)} />
    </div>
  );
}
