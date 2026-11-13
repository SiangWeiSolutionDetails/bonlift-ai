import { CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Insight } from "../overview";
import { findDefinition } from "../registry";

const DESTRUCTIVE_KINDS: Insight["kind"][] = ["latestRunFailed", "recentFailures"];

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  const { t } = useTranslation("calculations");

  if (insights.length === 0) return null;

  return (
    <section className="grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlertIcon className="size-4 text-amber-600 dark:text-amber-400" />
        {t("insights.title")}
      </h2>
      <ul className="grid gap-2">
        {insights.map((insight) => {
          const isDestructive = DESTRUCTIVE_KINDS.includes(insight.kind);
          const Icon = isDestructive ? CircleXIcon : TriangleAlertIcon;
          return (
            <li key={`${insight.kind}-${insight.jobType}`} className="flex gap-2 text-sm">
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  isDestructive ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                )}
              />
              <div className="grid min-w-0 gap-1">
                <InsightMessage insight={insight} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InsightMessage({ insight }: { insight: Insight }) {
  const { t } = useTranslation("calculations");
  const definition = findDefinition(insight.jobType);
  if (!definition) return null;
  const calculation = t(definition.titleKey);

  switch (insight.kind) {
    case "latestRunFailed":
      return insight.failures.map((failure, index) => (
        <div key={index} className="grid gap-0.5">
          <span>
            {failure.outletName
              ? t("insights.latestRunFailedOutlet", { calculation, outlet: failure.outletName })
              : t("insights.latestRunFailed", { calculation })}
          </span>
          <span className="break-words font-mono text-xs text-destructive">
            {failure.error ?? t("insights.noErrorMessage")}
          </span>
        </div>
      ));
    case "recentFailures":
      return <span>{t("insights.recentFailures", { calculation, count: insight.count })}</span>;
    case "noPublishedResults":
      if (insight.outletNames.length === 0) {
        return <span>{t("insights.noPublishedResultsBrand", { calculation })}</span>;
      }
      return (
        <span>
          {t("insights.noPublishedResults", {
            calculation,
            count: insight.outletNames.length,
            outlets: insight.outletNames.join(", "),
          })}
        </span>
      );
    case "noOrdersInWindow":
      return (
        <span>
          {t("insights.noOrdersInWindow", {
            calculation,
            count: insight.outletNames.length,
            outlets: insight.outletNames.join(", "),
          })}
        </span>
      );
    case "staleResults":
      return <span>{t("insights.staleResults", { calculation, count: insight.days })}</span>;
  }
}
