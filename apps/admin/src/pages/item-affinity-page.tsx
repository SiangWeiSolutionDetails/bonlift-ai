import { useEffect, useState } from "react";
import { PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/permissions";
import { RunCalculationDialog } from "@/features/item-affinity/components/run-calculation-dialog";
import { RunResultsCard } from "@/features/item-affinity/components/run-results-card";
import { RunsCard } from "@/features/item-affinity/components/runs-card";
import { ScoreFormula } from "@/features/item-affinity/components/score-formula";
import {
  useItemAffinityRun,
  useItemAffinityRuns,
} from "@/features/item-affinity/queries";
import type { ItemAffinitySearch } from "@/features/item-affinity/search";
import { isOtherBrandRun } from "@/features/workspaces/run-scope";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

const routeApi = getRouteApi("/_app/b/$brandId/item-affinity");

export function ItemAffinityPage() {
  const { t } = useTranslation("itemAffinity");
  const brandId = useWorkspaceBrandId();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const { canBrand } = usePermissions();

  const runs = useItemAffinityRuns(brandId);
  const runList = runs.data ?? [];
  const publishedRun = runList.find((run) => run.isPublished);
  const listedRun = runList.find((run) => run.id === search.runId);
  // A linked run older than the list's newest runs is fetched on its own; one of another brand is ignored
  const linkedRun = useItemAffinityRun(
    runs.isSuccess && !listedRun ? search.runId : undefined,
  );
  const unlistedRun =
    linkedRun.data?.brandId === brandId ? linkedRun.data : undefined;
  const isForeignRun = isOtherBrandRun(linkedRun.data, brandId);
  // A run outside the workspace brand is dropped from the URL, so the URL never names a run the page doesn't show
  useEffect(() => {
    if (!isForeignRun) return;
    navigate({ search: (prev) => ({ ...prev, runId: undefined, itemId: undefined }), replace: true, resetScroll: false });
  }, [isForeignRun, navigate]);
  // No run chosen: show what the brand serves now, else the newest run
  const viewingRun =
    listedRun ??
    unlistedRun ??
    (linkedRun.isLoading ? undefined : (publishedRun ?? runList[0]));

  // replace: picking a run or item should not fill the back button history
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
            {canBrand(brandId, "calculations.trigger") && (
              <Button onClick={() => setIsRunDialogOpen(true)}>
                <PlayIcon data-icon="inline-start" />
                {t("page.runCalculation")}
              </Button>
            )}
          </div>
        }
      />

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
        canPublishRuns={canBrand(brandId, "calculations.publish")}
        onView={viewRun}
        onPublished={viewRun}
      />
      <RunCalculationDialog
        brandId={brandId}
        open={isRunDialogOpen}
        onOpenChange={setIsRunDialogOpen}
        onStarted={(runId) => {
          setIsRunDialogOpen(false);
          viewRun(runId);
        }}
      />
    </div>
  );
}
