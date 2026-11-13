import { useMemo, useState } from "react";
import { PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
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
import { CalculationsOverviewReport } from "@/features/calculations-overview/components/calculations-overview-report";
import { RunAllDialog } from "@/features/calculations-overview/components/run-all-dialog";
import { useCalculationsOverview } from "@/features/calculations-overview/queries";
import type { StartAllResponse } from "@/features/calculations-overview/type";

const routeApi = getRouteApi("/calculations");

export function CalculationsPage() {
  const { t } = useTranslation("calculations");
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data: brands = [] } = useBrands();
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [started, setStarted] = useState<{ brandId: string; response: StartAllResponse }>();

  // The last click only counts for the brand it was made on
  const startResponse = started && started.brandId === search.brandId ? started.response : undefined;
  const trackedRunIds = useMemo(
    () => startResponse?.runs.map((run) => run.runId) ?? [],
    [startResponse],
  );
  const overview = useCalculationsOverview(search.brandId, trackedRunIds);

  // replace: picking a brand should not fill the back button history
  function selectBrand(brandId: string) {
    navigate({ search: { brandId }, replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          <Button disabled={!overview.data} onClick={() => setIsRunDialogOpen(true)}>
            <PlayIcon data-icon="inline-start" />
            {t("page.runAll")}
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <Label htmlFor="calculations-brand" className="shrink-0">
          {t("picker.brand")}
        </Label>
        <Select value={search.brandId ?? ""} onValueChange={selectBrand}>
          <SelectTrigger id="calculations-brand" className="w-56">
            <SelectValue placeholder={t("picker.brandPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!search.brandId ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("picker.noBrand")}
        </p>
      ) : (
        <CalculationsOverviewReport
          overview={overview.data}
          error={overview.error}
          isPending={overview.isPending}
          startResponse={startResponse}
        />
      )}

      {overview.data && (
        <RunAllDialog
          overview={overview.data}
          open={isRunDialogOpen}
          onOpenChange={setIsRunDialogOpen}
          onStarted={(response) => {
            setIsRunDialogOpen(false);
            setStarted({ brandId: response.brandId, response });
          }}
        />
      )}
    </div>
  );
}
