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
import { addDays, toCompactDate } from "@/features/outlet-item-scores/format";
import { toIsoDate } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { useStartItemAffinityRun } from "../queries";

// Longer than the other calculations' default: pairs need more orders than single items do
const DEFAULT_WINDOW_DAYS = 90;

type RunCalculationDialogProps = {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (runId: string) => void;
};

export function RunCalculationDialog({
  brandId,
  open,
  onOpenChange,
  onStarted,
}: RunCalculationDialogProps) {
  const { t } = useTranslation("itemAffinity");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>
        {/* Unmounts on close, so the dates and any error reset for free */}
        <RunCalculationForm brandId={brandId} onStarted={onStarted} />
      </DialogContent>
    </Dialog>
  );
}

function defaultRange() {
  // Local date: toISOString() would give yesterday's UTC date before 08:00 in Singapore
  const today = toIsoDate(new Date());
  const to = addDays(today, -1);
  return { from: addDays(to, -(DEFAULT_WINDOW_DAYS - 1)), to };
}

function RunCalculationForm({
  brandId,
  onStarted,
}: Pick<RunCalculationDialogProps, "brandId" | "onStarted">) {
  const { t } = useTranslation("itemAffinity");
  const { t: tCommon } = useTranslation();
  const [range, setRange] = useState(defaultRange);
  const startRun = useStartItemAffinityRun();

  // The API window is half-open, so the inclusive end date becomes the next day.
  const isRangeValid = range.from !== "" && range.to !== "" && range.from <= range.to;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isRangeValid) return;
    startRun.mutate(
      {
        brandId,
        input: {
          from: toCompactDate(range.from),
          to: toCompactDate(addDays(range.to, 1)),
        },
      },
      { onSuccess: (data) => onStarted(data.runId) },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="item-affinity-run-from">{t("dialog.from")}</Label>
          <DatePicker
            id="item-affinity-run-from"
            value={range.from}
            onChange={(from) => setRange({ ...range, from })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-affinity-run-to">{t("dialog.to")}</Label>
          <DatePicker
            id="item-affinity-run-to"
            value={range.to}
            min={range.from}
            onChange={(to) => setRange({ ...range, to })}
            invalid={!isRangeValid}
          />
        </div>
      </div>

      {!isRangeValid && range.from && range.to && (
        <p className="text-sm text-destructive">{t("dialog.invalidRange")}</p>
      )}

      {startRun.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(startRun.error, tCommon)}
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {tCommon("actions.cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!isRangeValid || startRun.isPending}>
          {startRun.isPending ? t("dialog.submitting") : t("dialog.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
