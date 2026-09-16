import { Worker } from "bullmq";
import { pathToFileURL } from "node:url";
import { getRedisConnection } from "./connection.js";
import {
  CUSTOMER_SCORING_QUEUE_NAME,
  OUTLET_SCORING_QUEUE_NAME,
} from "./queue.js";
import { processOutletScoringJob } from "./jobs/scoring.js";
import { processCustomerScoringJob } from "./jobs/customerScoring.js";

export function startWorker(): Worker[] {
  const outletScoringWorker = new Worker(
    OUTLET_SCORING_QUEUE_NAME,
    processOutletScoringJob,
    {
      connection: getRedisConnection(),
    },
  );
  const customerScoringWorker = new Worker(
    CUSTOMER_SCORING_QUEUE_NAME,
    processCustomerScoringJob,
    {
      connection: getRedisConnection(),
    },
  );

  const workers = [outletScoringWorker, customerScoringWorker];

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      console.error(`Job ${job?.id} failed:`, err);
    });
  }

  return workers;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorker();
  console.log("Worker started, listening for jobs...");
}
