import { CircleCheckIcon, CircleXIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ItemAffinityRun } from "../type";

const STATUS_VARIANT = {
  running: "secondary",
  succeeded: "success",
  failed: "destructive",
} as const;

// Only the version is shown; its settings appear on hover or keyboard focus, keeping rows compact.
export function RunConfigBadge({ run }: { run: ItemAffinityRun }) {
  const { t } = useTranslation("itemAffinity");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" tabIndex={0} className="cursor-default">
          {t("runs.configVersion", { version: run.configVersion })}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
          <dt className="opacity-70">{t("runs.topNLabel")}</dt>
          <dd>{run.topN}</dd>
          <dt className="opacity-70">{t("runs.minPairOrdersLabel")}</dt>
          <dd>{run.minPairOrders}</dd>
          <dt className="opacity-70">{t("runs.maxOrderItemsLabel")}</dt>
          <dd>{run.maxOrderItems}</dd>
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

export function RunStatusBadge({ run }: { run: ItemAffinityRun }) {
  const { t } = useTranslation("itemAffinity");

  return (
    <Badge variant={STATUS_VARIANT[run.status]} title={run.error ?? undefined}>
      {run.status === "running" && <Loader2Icon className="animate-spin" />}
      {run.status === "succeeded" && <CircleCheckIcon />}
      {run.status === "failed" && <CircleXIcon />}
      {t(`status.${run.status}`)}
    </Badge>
  );
}
