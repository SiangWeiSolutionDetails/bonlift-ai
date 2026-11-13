import { CircleCheckIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { countRunProgress } from "../overview";
import type { CalculationsOverview, StartAllResponse } from "../type";

type RunProgressProps = {
  overview: CalculationsOverview;
  response: StartAllResponse;
};

// Outcome of the last "Run all" click, then how far its runs have got.
export function RunProgress({ overview, response }: RunProgressProps) {
  const { t } = useTranslation("calculations");
  const progress = countRunProgress(
    overview,
    response.runs.map((run) => run.runId),
  );
  const isDone = progress.finished === progress.total;
  const percent = progress.total === 0 ? 100 : (progress.finished / progress.total) * 100;

  return (
    <div className="grid gap-3 rounded-xl bg-card p-5 shadow-panel">
      <p className="text-sm">
        {response.runs.length === 0 && response.failedToQueue === 0 ? (
          <span className="text-muted-foreground">{t("result.nothingToStart")}</span>
        ) : (
          <>
            {response.queued > 0 && t("result.started", { count: response.queued })}
            {response.failedToQueue > 0 && (
              <span className="text-destructive">
                {" "}
                {t("result.failedToQueue", { count: response.failedToQueue })}
              </span>
            )}
          </>
        )}
      </p>

      {progress.total > 0 && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-medium">
              {isDone ? (
                <CircleCheckIcon className="size-4 text-green-600 dark:text-green-400" />
              ) : (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {isDone ? t("progress.done") : t("progress.running")}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {t("progress.finished", { finished: progress.finished, total: progress.total })}
              {progress.failed > 0 && (
                <span className="text-destructive">
                  {" · "}
                  {t("progress.failed", { count: progress.failed })}
                </span>
              )}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.finished}
            aria-label={isDone ? t("progress.done") : t("progress.running")}
            aria-valuetext={t("progress.finished", { finished: progress.finished, total: progress.total })}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
