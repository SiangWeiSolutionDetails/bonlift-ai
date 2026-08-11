import { Worker } from "bullmq";
import { getRedisConnection } from "./connection.js";
import { OUTLET_SCORING_QUEUE_NAME } from "./queue.js";
import { processOutletScoringJob } from "./jobs/outletScoring.js";

export function startWorker(): Worker {
  const worker = new Worker(OUTLET_SCORING_QUEUE_NAME, processOutletScoringJob, {
    connection: getRedisConnection(),
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
  console.log("Worker started, listening for jobs...");
}
