import { shortRunId } from "../feedback";
import type { FeedbackRunRow } from "../type";
import { useFeedbackLabels } from "../use-feedback-labels";

// Job type and run time, then the short run id. Without run (a selected run the report does not list) only the id.
export function RunName({ runId, run }: { runId: string; run?: FeedbackRunRow }) {
  const { runLabel } = useFeedbackLabels();

  return (
    <span className="inline-flex items-center gap-2">
      {run && <span>{runLabel(run)}</span>}
      <span className="font-mono text-xs text-muted-foreground">{shortRunId(runId)}</span>
    </span>
  );
}
