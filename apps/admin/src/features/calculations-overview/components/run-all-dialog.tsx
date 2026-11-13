import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { useStartAllCalculations } from "../queries";
import { joinCalculations } from "../registry";
import type { CalculationsOverview, StartAllResponse } from "../type";

type RunAllDialogProps = {
  overview: CalculationsOverview;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (response: StartAllResponse) => void;
};

export function RunAllDialog({ overview, open, onOpenChange, onStarted }: RunAllDialogProps) {
  const { t } = useTranslation("calculations");
  // Owned here, not in the dialog body, so closing mid-request can't drop onStarted along with the unmounted body
  const startAll = useStartAllCalculations();

  function changeOpen(nextOpen: boolean) {
    if (startAll.isPending) return;
    if (!nextOpen) startAll.reset();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>
        <RunAllConfirm overview={overview} startAll={startAll} onStarted={onStarted} />
      </DialogContent>
    </Dialog>
  );
}

type RunAllConfirmProps = Pick<RunAllDialogProps, "overview" | "onStarted"> & {
  startAll: ReturnType<typeof useStartAllCalculations>;
};

function RunAllConfirm({ overview, startAll, onStarted }: RunAllConfirmProps) {
  const { t } = useTranslation("calculations");
  const { t: tCommon } = useTranslation();

  function submit() {
    startAll.mutate(overview.brandId, { onSuccess: onStarted });
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {joinCalculations(overview.calculations).map(({ definition, entry }) => (
          <li
            key={entry.jobType}
            className="flex flex-col gap-0.5 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <span className="text-sm font-medium">{t(definition.titleKey)}</span>
            <span className="text-sm text-muted-foreground">
              {t("dialog.window", { count: entry.windowDays, date: formatDate(overview.windowTo) })}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">{t("dialog.skipNote")}</p>

      {startAll.error && (
        <p className="text-sm text-destructive">{getErrorMessage(startAll.error, tCommon)}</p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={startAll.isPending}>
            {tCommon("actions.cancel")}
          </Button>
        </DialogClose>
        <Button type="button" onClick={submit} disabled={startAll.isPending}>
          {startAll.isPending ? t("dialog.submitting") : t("dialog.submit")}
        </Button>
      </DialogFooter>
    </div>
  );
}
