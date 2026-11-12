import type { ComponentType } from "react";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { FeedbackSummary as FeedbackSummaryData } from "../type";

// Full class names, not built from a colour variable, so Tailwind can find them in the source.
const TONES = {
  green: "bg-green-500 text-white",
  red: "bg-red-500 text-white",
} as const;

type SummaryTileProps = {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
};

// Same tile as the usage summary.
function SummaryTile({ label, value, icon: Icon, tone }: SummaryTileProps) {
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
    </div>
  );
}

export function FeedbackSummary({ summary }: { summary: FeedbackSummaryData }) {
  const { t } = useTranslation("recommendationFeedback");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SummaryTile
        label={t("summary.accepted")}
        value={summary.accepted.toLocaleString()}
        icon={CircleCheckIcon}
        tone="green"
      />
      <SummaryTile
        label={t("summary.rejected")}
        value={summary.rejected.toLocaleString()}
        icon={CircleXIcon}
        tone="red"
      />
    </div>
  );
}
