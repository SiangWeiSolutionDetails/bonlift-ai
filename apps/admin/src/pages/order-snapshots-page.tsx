import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { OrderSnapshotsCard } from "@/features/order-snapshots/components/order-snapshots-card";
import type { SnapshotsSearch } from "@/features/order-snapshots/search";
import { usePermissions } from "@/features/auth/permissions";
import { OutletPicker } from "@/features/outlet-item-scores/components/outlet-picker";
import { useBrandOutletId } from "@/features/outlets/queries";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

const routeApi = getRouteApi("/_app/b/$brandId/snapshots");

export function OrderSnapshotsPage() {
  const { t } = useTranslation("snapshots");
  const brandId = useWorkspaceBrandId();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { canBrand } = usePermissions();
  const outletId = useBrandOutletId(brandId, search.outletId);

  // replace: picking an outlet should not fill the back button history
  // resetScroll: a filter change should keep the user's scroll position
  function updateSearch(patch: Partial<SnapshotsSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("page.title")} />

      <OutletPicker
        brandId={brandId}
        outletId={outletId}
        onOutletChange={(next) => updateSearch({ outletId: next })}
      />

      {!outletId ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("page.noOutlet")}
        </p>
      ) : (
        <OrderSnapshotsCard
          key={outletId}
          outletId={outletId}
          canViewDays={canBrand(brandId, "snapshots.viewCustomerIds")}
        />
      )}
    </div>
  );
}
