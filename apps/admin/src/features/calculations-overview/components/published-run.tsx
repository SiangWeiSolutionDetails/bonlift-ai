import { Link } from "@tanstack/react-router";
import { formatWindow } from "@/features/outlet-item-scores/format";
import type { CalculationDetailsTarget } from "../registry";
import type { CalculationRun } from "../type";

const SHORT_RUN_ID_LENGTH = 8;

type PublishedRunProps = {
  run: CalculationRun;
  target: CalculationDetailsTarget;
};

export function PublishedRun({ run, target }: PublishedRunProps) {
  return (
    <span className="grid gap-0.5">
      <span>{formatWindow(run.from, run.to)}</span>
      <RunIdLink runId={run.id} target={target} />
    </span>
  );
}

type RunIdLinkProps = {
  runId: string;
  target: CalculationDetailsTarget;
};

export function RunIdLink({ runId, target }: RunIdLinkProps) {
  return (
    <Link
      {...target}
      title={runId}
      className="pointer-events-auto relative w-fit font-mono text-xs font-normal text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {runId.slice(0, SHORT_RUN_ID_LENGTH)}
    </Link>
  );
}
