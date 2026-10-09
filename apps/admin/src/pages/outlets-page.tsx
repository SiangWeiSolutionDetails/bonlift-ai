import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Brand } from "@/features/brands/type";
import { CreateOutletDialog } from "@/features/outlets/components/create-outlet-dialog";
import { EditOutletDialog } from "@/features/outlets/components/edit-outlet-dialog";
import { OutletsTable } from "@/features/outlets/components/outlets-table";
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

  // IMPLEMENT: replace these three with `useOutlets(listParams)`.
  const outlets: Outlet[] | undefined = [];
  const isPending = false;
  const error = null as Error | null;
  void listParams;

  // IMPLEMENT: replace with `useBrands()` (feeds the filter, the create dialog and the brand column).
  const brands: Brand[] = [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.description")}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          {t("page.newOutlet")}
        </Button>
      </div>

      <div className="flex items-center gap-2">
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
