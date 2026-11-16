import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { DatePicker } from "@/components/date-picker";
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
import { Label } from "@/components/ui/label";
import { formatWindow } from "@/features/outlet-item-scores/format";
import { getErrorMessage } from "@/lib/error-message";
import { useStartAllCalculations } from "../queries";
import { joinCalculations } from "../registry";
import type { CalculationJobType, CalculationsOverview, StartAllResponse } from "../type";
import { isValidWindow, scheduleWindows, toStartAllBody, type DateWindow } from "../windows";

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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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

function formatScheduleWindow(window: DateWindow) {
  return formatWindow(window.from, window.to);
}

// Unmounts when the dialog closes, so every open starts again from the schedule windows
function RunAllConfirm({ overview, startAll, onStarted }: RunAllConfirmProps) {
  const { t } = useTranslation("calculations");
  const { t: tCommon } = useTranslation();
  const calculations = joinCalculations(overview.calculations);
  const [defaults] = useState(() =>
    scheduleWindows(calculations.map(({ entry }) => entry), overview.windowTo),
  );
  const [windows, setWindows] = useState(defaults);

  const isValid = calculations.every(({ entry }) => {
    const window = windows[entry.jobType];
    return !window || isValidWindow(window);
  });
  const isEdited = Object.keys(toStartAllBody(defaults, windows)).length > 0;

  function setWindow(jobType: CalculationJobType, window: DateWindow) {
    setWindows((current) => ({ ...current, [jobType]: window }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    startAll.mutate(
      { brandId: overview.brandId, body: toStartAllBody(defaults, windows) },
      { onSuccess: onStarted },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <ul className="grid gap-3">
        {calculations.map(({ definition, entry }) => {
          const window = windows[entry.jobType];
          if (!window) return null;
          return (
            <WindowRow
              key={entry.jobType}
              jobType={entry.jobType}
              title={t(definition.titleKey)}
              scheduleHint={formatScheduleWindow(defaults[entry.jobType] ?? window)}
              window={window}
              onChange={(next) => setWindow(entry.jobType, next)}
            />
          );
        })}
      </ul>

      {isEdited && (
        <Button
          type="button"
          variant="link"
          className="h-auto justify-self-start p-0"
          onClick={() => setWindows(defaults)}
        >
          {t("dialog.resetDefaults")}
        </Button>
      )}

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
        <Button type="submit" disabled={!isValid || startAll.isPending}>
          {startAll.isPending ? t("dialog.submitting") : t("dialog.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

type WindowRowProps = {
  jobType: CalculationJobType;
  title: string;
  scheduleHint: string;
  window: DateWindow;
  onChange: (window: DateWindow) => void;
};

function WindowRow({ jobType, title, scheduleHint, window, onChange }: WindowRowProps) {
  const { t } = useTranslation("calculations");
  const isValid = isValidWindow(window);
  const fromId = `run-all-${jobType}-from`;
  const toId = `run-all-${jobType}-to`;

  return (
    <li className="grid gap-2 rounded-lg border px-3 py-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{t("dialog.scheduleDefault", { window: scheduleHint })}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={fromId} className="text-xs">{t("dialog.from")}</Label>
          <DatePicker id={fromId} value={window.from} onChange={(from) => onChange({ ...window, from })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={toId} className="text-xs">{t("dialog.to")}</Label>
          <DatePicker
            id={toId}
            value={window.to}
            min={window.from}
            onChange={(to) => onChange({ ...window, to })}
            invalid={!isValid}
          />
        </div>
      </div>
      {!isValid && window.from && window.to && (
        <p className="text-sm text-destructive">{t("dialog.invalidRange")}</p>
      )}
    </li>
  );
}
