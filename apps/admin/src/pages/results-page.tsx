import { useState } from "react";
import { PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { OutletPicker } from "@/features/outlet-item-scores/components/outlet-picker";
import { RankingCard } from "@/features/outlet-item-scores/components/ranking-card";
import { RunCalculationDialog } from "@/features/outlet-item-scores/components/run-calculation-dialog";
import { RunsCard } from "@/features/outlet-item-scores/components/runs-card";
import { useOutletItemScoresRuns } from "@/features/outlet-item-scores/queries";
import type { ResultsSearch } from "@/features/outlet-item-scores/search";

const routeApi = getRouteApi("/results");

export function ResultsPage() {
  const { t } = useTranslation("results");
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);

  const runs = useOutletItemScoresRuns(search.outletId);
  const runList = runs.data ?? [];
  const publishedRun = runList.find((run) => run.isPublished);
  // No run chosen: show what the outlet serves now, else the newest run
  const viewingRun =
    runList.find((run) => run.id === search.runId) ?? publishedRun ?? runList[0];

  // replace: picking an outlet or run should not fill the back button history
  function updateSearch(patch: Partial<ResultsSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          <Button
            disabled={!search.outletId}
            onClick={() => setIsRunDialogOpen(true)}
          >
            <PlayIcon data-icon="inline-start" />
            {t("page.runCalculation")}
          </Button>
        }
      />

      <OutletPicker
        brandId={search.brandId}
        outletId={search.outletId}
        onBrandChange={(brandId) =>
          updateSearch({ brandId, outletId: undefined, runId: undefined })
        }
        onOutletChange={(outletId) => updateSearch({ outletId, runId: undefined })}
      />

      {!search.outletId ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("picker.noOutlet")}
        </p>
      ) : (
        <>
          {viewingRun && <RankingCard key={viewingRun.id} run={viewingRun} />}
          <RunsCard
            runs={runs.data}
            isPending={runs.isPending}
            error={runs.error}
            viewingRunId={viewingRun?.id}
            onView={(runId) => updateSearch({ runId })}
            onPublished={(runId) => updateSearch({ runId })}
          />
          <RunCalculationDialog
            outletId={search.outletId}
            open={isRunDialogOpen}
            onOpenChange={setIsRunDialogOpen}
            onStarted={(runId) => {
              setIsRunDialogOpen(false);
              updateSearch({ runId });
            }}
          />
        </>
      )}
    </div>
  );
}
