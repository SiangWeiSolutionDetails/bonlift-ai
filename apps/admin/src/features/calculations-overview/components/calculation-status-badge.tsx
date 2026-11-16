import type { ReactNode } from "react";
import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { CalculationRun, CalculationRunStatus } from "../type";

export type BadgeStatus = CalculationRunStatus | "neverRun";

// One look per status, shared by every status badge on the page
const STATUS_STYLE = {
  running: { variant: "secondary", icon: <Loader2Icon className="animate-spin" /> },
  succeeded: { variant: "success", icon: <CircleCheckIcon /> },
  failed: { variant: "destructive", icon: <CircleXIcon /> },
  neverRun: { variant: "outline", icon: <CircleDashedIcon /> },
} as const;

export function StatusBadge({ status, title, children }: { status: BadgeStatus; title?: string; children: ReactNode }) {
  const style = STATUS_STYLE[status];
  return (
    <Badge variant={style.variant} title={title}>
      {style.icon}
      {children}
    </Badge>
  );
}

export function CalculationStatusBadge({ run }: { run: CalculationRun | null }) {
  const { t } = useTranslation("calculations");
  const status = run?.status ?? "neverRun";

  return (
    <StatusBadge status={status} title={run?.error ?? undefined}>
      {t(`status.${status}`)}
    </StatusBadge>
  );
}
