import { closePool } from "@ai-services/db";
import { getRedisConnection } from "./connection.js";
import { startCustomerItemScoresWorker } from "./workers/customerItemScores.worker.js";
import { startItemAffinityWorker } from "./workers/itemAffinity.worker.js";
import { startOutletItemScoresWorker } from "./workers/outletItemScores.worker.js";

const workers = [
  startOutletItemScoresWorker(),
  startCustomerItemScoresWorker(),
  startItemAffinityWorker(),
];

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, shutting down`);

  try {
    // close() waits for the job in progress, so no run is left half-done.
    await Promise.all(workers.map((worker) => worker.close()));
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
