import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { OverviewTotals } from "../overview";

// Same solid icon tiles as the usage summaries; full class names so Tailwind finds them.
const TONES = {
  info: "bg-blue-500 text-white",
  good: "bg-green-500 text-white",
  bad: "bg-red-500 text-white",
} as const;

export function OverviewTotalsStrip({ totals }: { totals: OverviewTotals }) {
  const { t } = useTranslation("calculations");
  const ofScopes = t("totals.ofLatestRuns", { count: totals.scopes });

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <TotalTile icon={CircleCheckIcon} tone="good" label={t("totals.succeeded")} value={totals.succeeded} caption={ofScopes} />
      <TotalTile icon={CircleXIcon} tone="bad" label={t("totals.failed")} value={totals.failed} caption={ofScopes} />
      <TotalTile
        icon={LoaderCircleIcon}
        tone="info"
        label={t("totals.running")}
        value={totals.running}
        caption={ofScopes}
        spin={totals.running > 0}
      />
    </div>
  );
}

type TotalTileProps = {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: number;
  caption: string;
  spin?: boolean;
};

function TotalTile({ icon: Icon, tone, label, value, caption, spin = false }: TotalTileProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-panel">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm", TONES[tone])}>
          <Icon className={cn("size-4", spin && "animate-spin")} />
        </span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{value.toLocaleString()}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{caption}</span>
      </div>
    </div>
  );
}
