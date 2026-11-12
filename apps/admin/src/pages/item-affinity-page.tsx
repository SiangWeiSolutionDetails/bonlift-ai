import { useState } from "react";
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
import { RunCalculationDialog } from "@/features/item-affinity/components/run-calculation-dialog";
import { RunResultsCard } from "@/features/item-affinity/components/run-results-card";
import { RunsCard } from "@/features/item-affinity/components/runs-card";
import { ScoreFormula } from "@/features/item-affinity/components/score-formula";
import {
  useItemAffinityRun,
  useItemAffinityRuns,
} from "@/features/item-affinity/queries";
import type { ItemAffinitySearch } from "@/features/item-affinity/search";

const routeApi = getRouteApi("/item-affinity");

export function ItemAffinityPage() {
  const { t } = useTranslation("itemAffinity");
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const { data: brands = [] } = useBrands();

  const runs = useItemAffinityRuns(search.brandId);
  const runList = runs.data ?? [];
  const publishedRun = runList.find((run) => run.isPublished);
  const listedRun = runList.find((run) => run.id === search.runId);
  // A linked run older than the list's newest runs is fetched on its own; one of another brand is ignored
  const linkedRun = useItemAffinityRun(
    runs.isSuccess && !listedRun ? search.runId : undefined,
  );
  const unlistedRun =
    linkedRun.data?.brandId === search.brandId ? linkedRun.data : undefined;
  // No run chosen: show what the brand serves now, else the newest run
  const viewingRun =
    listedRun ??
    unlistedRun ??
    (linkedRun.isLoading ? undefined : (publishedRun ?? runList[0]));

  // replace: picking a brand, run or item should not fill the back button history
  // resetScroll: a selection change should keep the user's scroll position
  function updateSearch(patch: Partial<ItemAffinitySearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false });
  }

  function viewRun(runId: string) {
    updateSearch({ runId, itemId: undefined });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ScoreFormula />
            <Button
              disabled={!search.brandId}
              onClick={() => setIsRunDialogOpen(true)}
            >
              <PlayIcon data-icon="inline-start" />
              {t("page.runCalculation")}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <Label htmlFor="item-affinity-brand" className="shrink-0">
          {t("picker.brand")}
        </Label>
        <Select
          value={search.brandId ?? ""}
          onValueChange={(brandId) =>
            updateSearch({ brandId, runId: undefined, itemId: undefined })
          }
        >
          <SelectTrigger id="item-affinity-brand" className="w-56">
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
        <>
          {viewingRun && (
            <RunResultsCard
              key={viewingRun.id}
              run={viewingRun}
              itemId={search.itemId}
              onSelectItem={(itemId) => updateSearch({ itemId })}
            />
          )}
          <RunsCard
            runs={runs.data}
            isPending={runs.isPending}
            error={runs.error}
            viewingRunId={viewingRun?.id}
            onView={viewRun}
            onPublished={viewRun}
          />
          <RunCalculationDialog
            brandId={search.brandId}
            open={isRunDialogOpen}
            onOpenChange={setIsRunDialogOpen}
            onStarted={(runId) => {
              setIsRunDialogOpen(false);
              viewRun(runId);
            }}
          />
        </>
      )}
    </div>
  );
}
