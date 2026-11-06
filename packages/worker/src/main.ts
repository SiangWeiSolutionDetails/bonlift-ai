import { closePool } from "@bonlift-ai/db";
import { getRedisConnection } from "./connection.js";
import { startCustomerItemScoresWorker } from "./workers/customerItemScores.worker.js";
import { startItemAffinityWorker } from "./workers/itemAffinity.worker.js";
import { startOutletItemScoresWorker } from "./workers/outletItemScores.worker.js";
import { startScheduledCalculationsWorker } from "./workers/scheduledCalculations.worker.js";
import { registerScheduledCalculations } from "./queues/scheduledCalculations.queue.js";

// The ordering apps push the previous day's orders before this runs. The same zone ends each window "yesterday".
const SCHEDULE_CRON = process.env.SCHEDULE_CRON || "0 3 * * *";
const SCHEDULE_TZ = process.env.SCHEDULE_TZ || "Asia/Singapore";
const SCHEDULED_RUN_WINDOWS = {
  timeZone: SCHEDULE_TZ,
  outletWindowDays: 28,
  brandWindowDays: 90,
};

const workers = [
  startOutletItemScoresWorker(),
  startCustomerItemScoresWorker(),
  startItemAffinityWorker(),
  startScheduledCalculationsWorker(SCHEDULED_RUN_WINDOWS),
];

registerScheduledCalculations({ pattern: SCHEDULE_CRON, timeZone: SCHEDULE_TZ })
  .then(() => console.log(`[worker] calculations scheduled at "${SCHEDULE_CRON}" ${SCHEDULE_TZ}`))
  .catch((error) => {
    console.error("[worker] scheduling calculations failed: ", error);
    void shutdown("schedule failure");
  });

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
