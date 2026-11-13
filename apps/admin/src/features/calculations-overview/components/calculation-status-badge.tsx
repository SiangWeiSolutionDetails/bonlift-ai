import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { CalculationRun } from "../type";

const STATUS_VARIANT = {
  running: "secondary",
  succeeded: "success",
  failed: "destructive",
} as const;

export function CalculationStatusBadge({ run }: { run: CalculationRun | null }) {
  const { t } = useTranslation("calculations");

  if (!run) {
    return (
      <Badge variant="outline">
        <CircleDashedIcon />
        {t("status.neverRun")}
      </Badge>
    );
  }

  return (
    <Badge variant={STATUS_VARIANT[run.status]} title={run.error ?? undefined}>
      {run.status === "running" && <Loader2Icon className="animate-spin" />}
      {run.status === "succeeded" && <CircleCheckIcon />}
      {run.status === "failed" && <CircleXIcon />}
      {t(`status.${run.status}`)}
    </Badge>
  );
}
