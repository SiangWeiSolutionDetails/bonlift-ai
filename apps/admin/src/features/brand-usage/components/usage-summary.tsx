import type { ComponentType } from "react";
import { CircleCheckIcon, CpuIcon, PlugIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { UsageTotals } from "../days";

// Full class names, not built from a colour variable, so Tailwind can find them in the source.
const TONES = {
  violet: "bg-violet-500 text-white",
  green: "bg-green-500 text-white",
  orange: "bg-orange-500 text-white",
  primary: "bg-primary text-primary-foreground",
} as const;

type SummaryTileProps = {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
};

// Same badge as SectionCard; the colour marks which metric a tile is, the value stays in text colour.
function SummaryTile({ label, value, hint, icon: Icon, tone }: SummaryTileProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-panel">
      <div className="flex items-center gap-3">
        <span
          className={cn("flex size-9 items-center justify-center rounded-xl shadow-sm", TONES[tone])}
        >
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="min-h-4 text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

export function UsageSummary({ totals }: { totals: UsageTotals }) {
  const { t, i18n } = useTranslation("usage");
  const errors = totals.clientErrors + totals.serverErrors;
  const calls = totals.succeeded + errors;
  const percent = new Intl.NumberFormat(i18n.language, {
    style: "percent",
    maximumFractionDigits: 1,
  });

  // No calls means no rate, not a 0% one.
  const rate = (count: number) => (calls === 0 ? "—" : percent.format(count / calls));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryTile
        label={t("summary.calls")}
        value={calls.toLocaleString()}
        icon={PlugIcon}
        tone="violet"
      />
      <SummaryTile
        label={t("summary.successRate")}
        value={rate(totals.succeeded)}
        hint={t("summary.successRateHint", { count: totals.succeeded.toLocaleString() })}
        icon={CircleCheckIcon}
        tone="green"
      />
      <SummaryTile
        label={t("summary.errorRate")}
        value={rate(errors)}
        hint={t("summary.errorRateHint", {
          client: totals.clientErrors.toLocaleString(),
          server: totals.serverErrors.toLocaleString(),
        })}
        icon={TriangleAlertIcon}
        tone="orange"
      />
      <SummaryTile
        label={t("counts.calculationRuns")}
        value={totals.calculationRuns.toLocaleString()}
        icon={CpuIcon}
        tone="primary"
      />
    </div>
  );
}
