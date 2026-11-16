import { CircleCheckIcon, CircleXIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { OverviewTotals } from "../overview";

// Same solid icon tiles as the recommendation feedback and usage summaries; full class names so Tailwind finds them.
const TONES = {
  good: "bg-green-500 text-white",
  bad: "bg-red-500 text-white",
} as const;

export function OverviewTotalsStrip({ totals }: { totals: OverviewTotals }) {
  const { t } = useTranslation("calculations");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TotalTile
        icon={CircleCheckIcon}
        tone="good"
        label={t("totals.succeededLast7Days")}
        value={totals.succeededRunsLast7Days}
      />
      <TotalTile
        icon={CircleXIcon}
        tone="bad"
        label={t("totals.failedLast7Days")}
        value={totals.failedRunsLast7Days}
      />
    </div>
  );
}

type TotalTileProps = {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: number;
};

function TotalTile({ icon: Icon, tone, label, value }: TotalTileProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-panel">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm", TONES[tone])}>
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
