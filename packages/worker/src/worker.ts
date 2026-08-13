import { Worker } from "bullmq";
import { pathToFileURL } from "node:url";
import { getRedisConnection } from "./connection.js";
import { OUTLET_SCORING_QUEUE_NAME } from "./queue.js";
import { processOutletScoringJob } from "./jobs/scoring.js";

export function startWorker(): Worker {
  const worker = new Worker(OUTLET_SCORING_QUEUE_NAME, processOutletScoringJob, {
    connection: getRedisConnection(),
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorker();
  console.log("Worker started, listening for jobs...");
}
