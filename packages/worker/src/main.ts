import { closePool, getPool } from "@bonlift-ai/db";
import { closeRedisConnections } from "./connection.js";
import { reconcileWithRetry } from "./schedules/reconcileCalculationSchedules.js";
import { startCustomerItemScoresWorker } from "./workers/customerItemScores.worker.js";
import { startItemAffinityWorker } from "./workers/itemAffinity.worker.js";
import { startOutletItemScoresWorker } from "./workers/outletItemScores.worker.js";
import { startScheduledCalculationsWorker } from "./workers/scheduledCalculations.worker.js";

const workers = [
  startOutletItemScoresWorker(),
  startCustomerItemScoresWorker(),
  startItemAffinityWorker(),
  startScheduledCalculationsWorker(),
];

let shuttingDown = false;

// Each brand's schedule lives in brand_calculation_schedules (set in the admin); this rebuilds BullMQ from it.
void reconcileWithRetry(getPool(), () => shuttingDown);

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, shutting down`);

  try {
    // close() waits for the job in progress, so no run is left half-done.
    await Promise.all(workers.map((worker) => worker.close()));
    await closePool();
    await closeRedisConnections();
    process.exit(0);
  } catch (error) {
    console.error("[worker] shutdown failed: ", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
