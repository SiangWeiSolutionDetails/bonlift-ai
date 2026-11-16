import { useEffect, useRef } from "react";
import {
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  LoaderCircleIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { countRunProgress, runAllPhase, type RunAllPhase, type RunProgress } from "../overview";
import type { CalculationsOverview, StartAllResponse } from "../type";

const TOAST_ID = "run-all-calculations";
const DISMISS_AFTER_MS = 5000;

// Same solid icon tiles as the summary cards
const PHASES: Record<RunAllPhase, { icon: LucideIcon; tile: string; bar: string }> = {
  running: { icon: LoaderCircleIcon, tile: "bg-blue-500 text-white", bar: "bg-blue-500" },
  succeeded: { icon: CircleCheckIcon, tile: "bg-green-500 text-white", bar: "bg-green-500" },
  failed: { icon: CircleXIcon, tile: "bg-red-500 text-white", bar: "bg-red-500" },
  nothingToStart: { icon: InfoIcon, tile: "bg-slate-400 text-white dark:bg-slate-500", bar: "bg-slate-400" },
};

// Shows the last Run all click's runs live while the page polls; dismisses itself a few seconds after a clean
// finish, and stays until closed when anything failed.
export function useRunAllToast(overview: CalculationsOverview | undefined, response: StartAllResponse | undefined) {
  const progress = overview && response ? countRunProgress(overview, response.runs.map((run) => run.runId)) : null;
  const phase = progress ? runAllPhase(progress) : null;
  const { total = 0, finished = 0, failed = 0 } = progress ?? {};
  // Closed by the user: later progress updates of the same click must not bring it back
  const closedResponse = useRef<StartAllResponse>(undefined);

  useEffect(() => {
    if (!response || !phase || closedResponse.current === response) {
      toast.dismiss(TOAST_ID);
      return;
    }

    toast.custom(
      (id) => (
        <RunAllToastCard
          phase={phase}
          progress={{ total, finished, failed }}
          failedToQueue={response.failedToQueue}
          onClose={() => {
            closedResponse.current = response;
            toast.dismiss(id);
          }}
        />
      ),
      { id: TOAST_ID, duration: Infinity },
    );

    if (phase !== "succeeded" && phase !== "nothingToStart") return;
    const timer = setTimeout(() => toast.dismiss(TOAST_ID), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [response, phase, total, finished, failed]);

  useEffect(() => () => void toast.dismiss(TOAST_ID), []);
}

type RunAllToastCardProps = {
  phase: RunAllPhase;
  progress: RunProgress;
  failedToQueue: number;
  onClose: () => void;
};

function RunAllToastCard({ phase, progress, failedToQueue, onClose }: RunAllToastCardProps) {
  const { t } = useTranslation("calculations");
  const { t: tCommon } = useTranslation();
  const { icon: Icon, tile, bar } = PHASES[phase];
  const percent = progress.total === 0 ? 100 : (progress.finished / progress.total) * 100;
  const title = {
    running: t("progress.running"),
    succeeded: t("progress.done"),
    failed: t("progress.doneWithFailures"),
    nothingToStart: t("result.nothingToStartTitle"),
  }[phase];

  return (
    <div
      role="status"
      className="grid w-[var(--width,356px)] gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-panel"
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm", tile)}>
          <Icon className={cn("size-4", phase === "running" && "animate-spin")} />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {phase === "nothingToStart" ? (
              t("result.nothingToStart")
            ) : (
              <>
                {t("progress.finished", { finished: progress.finished, total: progress.total })}
                {progress.failed > 0 && (
                  <span className="text-destructive">
                    {" · "}
                    {t("progress.failed", { count: progress.failed })}
                  </span>
                )}
              </>
            )}
          </span>
          {failedToQueue > 0 && (
            <span className="text-xs text-destructive">{t("result.failedToQueue", { count: failedToQueue })}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon("actions.close")}
          className="-m-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {phase !== "nothingToStart" && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.finished}
          aria-label={title}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
