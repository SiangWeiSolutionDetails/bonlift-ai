import type { Job } from "bullmq";
import type { OutletScoringJobData } from "../queue.js";

export async function processOutletScoringJob(job: Job<OutletScoringJobData>): Promise<void> {
  // TODO(Task 11): call your Task 10 scoring query for job.data.outletId,
  // then upsert the results into outlet_item_scores.
  throw new Error("not implemented — see Task 11");
}
