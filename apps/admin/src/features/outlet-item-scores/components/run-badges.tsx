import { CircleCheckIcon, CircleXIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OutletItemScoresRun } from "../type";

const STATUS_VARIANT = {
  running: "secondary",
  succeeded: "success",
  failed: "destructive",
} as const;

// Only the version is shown; its settings appear on hover or keyboard focus, keeping rows compact.
export function RunConfigBadge({ run }: { run: OutletItemScoresRun }) {
  const { t } = useTranslation("results");
  const dayparts = run.dayparts.length
    ? run.dayparts.map(({ name, start, end }) => `${name} ${start}–${end}`)
    : [t("ranking.allDay")];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" tabIndex={0} className="cursor-default">
          {t("runs.configVersion", { version: run.configVersion })}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
          <dt className="opacity-70">{t("runs.halfLifeLabel")}</dt>
          <dd>{t("runs.halfLifeValue", { halfLifeDays: run.halfLifeDays })}</dd>
          <dt className="opacity-70">{t("runs.topNLabel")}</dt>
          <dd>{run.topN}</dd>
          <dt className="opacity-70">{t("runs.daypartsLabel")}</dt>
          <dd className="grid">
            {dayparts.map((daypart) => (
              <span key={daypart}>{daypart}</span>
            ))}
          </dd>
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

export function RunStatusBadge({ run }: { run: OutletItemScoresRun }) {
  const { t } = useTranslation("results");

  return (
    <Badge variant={STATUS_VARIANT[run.status]} title={run.error ?? undefined}>
      {run.status === "running" && <Loader2Icon className="animate-spin" />}
      {run.status === "succeeded" && <CircleCheckIcon />}
      {run.status === "failed" && <CircleXIcon />}
      {t(`status.${run.status}`)}
    </Badge>
  );
}
