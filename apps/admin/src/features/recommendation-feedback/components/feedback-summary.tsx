import type { ComponentType } from "react";
import {
  CircleCheckIcon,
  CircleSlashIcon,
  CircleXIcon,
  HourglassIcon,
  ListOrderedIcon,
  MessageSquareIcon,
  PercentIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatRate } from "../feedback";
import type { FeedbackSummary as FeedbackSummaryData } from "../type";

// Full class names, not built from a colour variable, so Tailwind can find them in the source.
const TONES = {
  violet: "bg-violet-500 text-white",
  green: "bg-green-500 text-white",
  red: "bg-red-500 text-white",
  zinc: "bg-zinc-500 text-white",
  sky: "bg-sky-500 text-white",
  primary: "bg-primary text-primary-foreground",
} as const;

type SummaryTileProps = {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
};

// Same tile as the usage summary.
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

export function FeedbackSummary({ summary }: { summary: FeedbackSummaryData }) {
  const { t, i18n } = useTranslation("recommendationFeedback");

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryTile
        label={t("summary.acceptanceRate")}
        value={formatRate(summary.acceptanceRate, i18n.language)}
        hint={t("summary.acceptanceRateHint")}
        icon={PercentIcon}
        tone="primary"
      />
      <SummaryTile
        label={t("summary.serves")}
        value={summary.serves.toLocaleString()}
        hint={t("summary.servesHint")}
        icon={MessageSquareIcon}
        tone="violet"
      />
      <SummaryTile
        label={t("summary.servedItems")}
        value={summary.servedItems.toLocaleString()}
        icon={ListOrderedIcon}
        tone="violet"
      />
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
      <SummaryTile
        label={t("summary.ignored")}
        value={summary.ignored.toLocaleString()}
        hint={t("summary.ignoredHint")}
        icon={CircleSlashIcon}
        tone="zinc"
      />
      <SummaryTile
        label={t("summary.awaiting")}
        value={summary.awaiting.toLocaleString()}
        hint={t("summary.awaitingHint")}
        icon={HourglassIcon}
        tone="sky"
      />
    </div>
  );
}
