import { Job, Worker } from "bullmq";
import { CalculationJobData, CALCULATIONS_QUEUE_NAME } from "./queue.js";
import { getRedisConnection } from "./connection.js";
import { closePool } from "@ai-services/db";

async function processCalculation(job: Job<CalculationJobData>): Promise<void> {
  console.log(`[worker] received run ${job.data.runId}`);
}

const worker = new Worker<CalculationJobData>(
  CALCULATIONS_QUEUE_NAME,
  processCalculation,
  {
    connection: getRedisConnection(),
    concurrency: 1,
  },
);

worker.on("ready", () => {
  console.log(`[worker] listening to "${CALCULATIONS_QUEUE_NAME}"`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] run ${job?.data?.runId} failed: ${error.message}`);
});

worker.on("error", (error) => {
  console.error("[worker] error: ", error);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, shutting down`);

  try {
    await worker.close();
    await closePool();
    await getRedisConnection().quit();
    process.exit(0);
  } catch (error) {
    console.error("[worker] shutdown failed: ", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
