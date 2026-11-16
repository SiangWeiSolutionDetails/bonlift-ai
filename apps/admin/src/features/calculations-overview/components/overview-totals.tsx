import type { ReactNode } from "react";
import {
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { OverviewTotals } from "../overview";

// Same solid icon tiles as the recommendation feedback and usage summaries; full class names so Tailwind finds them.
const TONES = {
  neutral: "bg-slate-400 text-white dark:bg-slate-500",
  info: "bg-blue-500 text-white",
  good: "bg-green-500 text-white",
  warn: "bg-amber-500 text-white",
  bad: "bg-red-500 text-white",
} as const;

type Tone = keyof typeof TONES;

type OverviewTotalsProps = { totals: OverviewTotals; attentionCount: number };

export function OverviewTotalsStrip({ totals, attentionCount }: OverviewTotalsProps) {
  const { t } = useTranslation("calculations");
  const age = totals.oldestResultsAgeDays;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <TotalTile
        icon={attentionCount > 0 ? TriangleAlertIcon : CircleCheckIcon}
        tone={attentionCount > 0 ? "warn" : "good"}
        label={t("totals.attention")}
        value={attentionCount > 0 ? attentionCount : t("totals.allGood")}
      />
      <TotalTile
        icon={LoaderCircleIcon}
        tone={totals.runningRuns > 0 ? "info" : "neutral"}
        label={t("totals.running")}
        value={totals.runningRuns}
        spin={totals.runningRuns > 0}
      />
      <TotalTile
        icon={CircleXIcon}
        tone={totals.failedRunsLast7Days > 0 ? "bad" : "neutral"}
        label={t("totals.failedLast7Days")}
        value={totals.failedRunsLast7Days}
      />
      <TotalTile
        icon={ClockIcon}
        tone={ageTone(age)}
        label={t("totals.oldestResults")}
        value={
          age === null
            ? t("card.nothingPublished")
            : age <= 0
              ? t("card.upToDate")
              : t("card.resultsAgeValue", { count: age })
        }
      />
    </div>
  );
}

function ageTone(age: number | null): Tone {
  if (age === null) return "neutral";
  if (age <= 1) return "good";
  return "warn";
}

type TotalTileProps = {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: ReactNode;
  spin?: boolean;
};

function TotalTile({ icon: Icon, tone, label, value, spin = false }: TotalTileProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-panel">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm", TONES[tone])}>
          <Icon className={cn("size-4", spin && "animate-spin")} />
        </span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
    </div>
  );
}
