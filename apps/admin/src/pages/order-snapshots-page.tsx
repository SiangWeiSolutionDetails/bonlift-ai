import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { OrderSnapshotsCard } from "@/features/order-snapshots/components/order-snapshots-card";
import type { SnapshotsSearch } from "@/features/order-snapshots/search";
import { OutletPicker } from "@/features/outlet-item-scores/components/outlet-picker";

const routeApi = getRouteApi("/snapshots");

export function OrderSnapshotsPage() {
  const { t } = useTranslation("snapshots");
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  // replace: picking an outlet should not fill the back button history
  function updateSearch(patch: Partial<SnapshotsSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("page.title")} />

      <OutletPicker
        brandId={search.brandId}
        outletId={search.outletId}
        onBrandChange={(brandId) => updateSearch({ brandId, outletId: undefined })}
        onOutletChange={(outletId) => updateSearch({ outletId })}
      />

      {!search.outletId ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("page.noOutlet")}
        </p>
      ) : (
        <OrderSnapshotsCard key={search.outletId} outletId={search.outletId} />
      )}
    </div>
  );
}
