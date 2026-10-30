import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { formatKilobytes } from "../format";
import { useOrderSnapshot } from "../queries";
import type { OrderSnapshotDay } from "../type";

const COPIED_FEEDBACK_MS = 1500;

type OrderSnapshotDialogProps = {
  outletId: string;
  day: OrderSnapshotDay | undefined;
  onClose: () => void;
};

export function OrderSnapshotDialog({ outletId, day, onClose }: OrderSnapshotDialogProps) {
  const { t } = useTranslation("snapshots");

  return (
    <Dialog open={day !== undefined} onOpenChange={(open) => !open && onClose()}>
      {/* No description; undefined tells Radix that's intentional instead of warning */}
      <DialogContent className="sm:max-w-3xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {t("dialog.title", { date: day ? formatDate(day.date) : "" })}
          </DialogTitle>
        </DialogHeader>
        {/* Unmounts on close, so the fetched orders and copy state go with it */}
        {day && <SnapshotBody outletId={outletId} day={day} />}
      </DialogContent>
    </Dialog>
  );
}

function SnapshotBody({ outletId, day }: { outletId: string; day: OrderSnapshotDay }) {
  const { t } = useTranslation("snapshots");
  const { t: tCommon } = useTranslation();
  const snapshot = useOrderSnapshot(outletId, day.date);
  const [copied, setCopied] = useState(false);

  const json = useMemo(
    () => (snapshot.data ? JSON.stringify(snapshot.data, null, 2) : ""),
    [snapshot.data],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the JSON stays selectable as text
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex items-end justify-between gap-4">
        <SnapshotDetails day={day} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copy}
          disabled={!snapshot.data}
        >
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {copied ? t("dialog.copied") : t("dialog.copy")}
        </Button>
      </div>

      {snapshot.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : snapshot.error ? (
        <p className="py-10 text-center text-sm text-destructive">
          {getErrorMessage(snapshot.error, tCommon)}
        </p>
      ) : (
        <pre className="max-h-[60vh] overflow-auto rounded-xl border bg-muted/50 p-4 font-mono text-xs">
          {json}
        </pre>
      )}
    </div>
  );
}

// Facts come from the table row, so they show while the orders are still loading
function SnapshotDetails({ day }: { day: OrderSnapshotDay }) {
  const { t, i18n } = useTranslation("snapshots");

  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
      <Detail label={t("card.orders")}>
        <span className="tabular-nums">{day.orderCount ?? "—"}</span>
      </Detail>
      <Detail label={t("card.updated")}>
        {day.updatedAt ? formatDateTime(day.updatedAt) : "—"}
      </Detail>
      <Detail label={t("card.size")}>
        <span className="tabular-nums">
          {day.sizeBytes === null ? "—" : formatKilobytes(day.sizeBytes, i18n.language)}
        </span>
      </Detail>
    </dl>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
