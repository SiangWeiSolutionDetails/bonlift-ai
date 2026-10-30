import { Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingBadge } from "@/components/setting-badge";
import { Badge } from "@/components/ui/badge";
import type { OutletItemScoresRun } from "../type";

const STATUS_VARIANT = {
  running: "secondary",
  succeeded: "success",
  failed: "destructive",
} as const;

export function RunConfigBadges({ run }: { run: OutletItemScoresRun }) {
  const { t } = useTranslation("results");

  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge>{t("runs.configVersion", { version: run.configVersion })}</Badge>
      <SettingBadge>
        {t("runs.halfLife", { halfLifeDays: run.halfLifeDays })}
      </SettingBadge>
      <SettingBadge>{t("runs.topN", { topN: run.topN })}</SettingBadge>
    </div>
  );
}

export function RunStatusBadge({ run }: { run: OutletItemScoresRun }) {
  const { t } = useTranslation("results");

  return (
    <Badge variant={STATUS_VARIANT[run.status]} title={run.error ?? undefined}>
      {run.status === "running" && <Loader2Icon className="animate-spin" />}
      {t(`status.${run.status}`)}
    </Badge>
  );
}
