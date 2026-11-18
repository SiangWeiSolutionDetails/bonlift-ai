import { useMemo, useState } from "react";
import { PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/permissions";
import { CalculationsOverviewReport } from "@/features/calculations-overview/components/calculations-overview-report";
import { RunAllDialog } from "@/features/calculations-overview/components/run-all-dialog";
import { useRunAllToast } from "@/features/calculations-overview/components/run-all-toast";
import { useCalculationsOverview } from "@/features/calculations-overview/queries";
import type { StartAllResponse } from "@/features/calculations-overview/type";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

export function CalculationsPage() {
  const { t } = useTranslation("calculations");
  const brandId = useWorkspaceBrandId();
  const { canBrand } = usePermissions();
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [startResponse, setStartResponse] = useState<StartAllResponse>();
  const trackedRunIds = useMemo(
    () => startResponse?.runs.map((run) => run.runId) ?? [],
    [startResponse],
  );
  const overview = useCalculationsOverview(brandId, trackedRunIds);
  useRunAllToast(overview.data, startResponse);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canBrand(brandId, "calculations.trigger") && (
            <Button disabled={!overview.data} onClick={() => setIsRunDialogOpen(true)}>
              <PlayIcon data-icon="inline-start" />
              {t("page.runAll")}
            </Button>
          )
        }
      />

      <CalculationsOverviewReport
        overview={overview.data}
        error={overview.error}
        isPending={overview.isPending}
      />

      {overview.data && (
        <RunAllDialog
          overview={overview.data}
          open={isRunDialogOpen}
          onOpenChange={setIsRunDialogOpen}
          onStarted={(response) => {
            setIsRunDialogOpen(false);
            setStartResponse(response);
          }}
        />
      )}
    </div>
  );
}
