import { Pool } from "pg";
import {
  BrandScheduleTiming,
  removeLegacyCalculationSchedule,
  syncBrandCalculationSchedule,
} from "../queues/scheduledCalculations.queue.js";
import { listBrandSchedules } from "../runs/scheduledRuns.repository.js";

export interface ReconcileDeps {
  sync: (brandId: string, timing: BrandScheduleTiming) => Promise<void>;
  removeLegacy: () => Promise<void>;
}

const DEPS: ReconcileDeps = {
  sync: syncBrandCalculationSchedule,
  removeLegacy: removeLegacyCalculationSchedule,
};

const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

// The database is the source of truth: every brand's BullMQ scheduler is rebuilt from its row, so a Redis wipe, a
// missed API sync or a brand deleted with its tenant all converge here. Disabled and deleted brands are removed.
export async function reconcileCalculationSchedules(
  pool: Pool,
  deps: ReconcileDeps = DEPS,
): Promise<number> {
  const schedules = await listBrandSchedules(pool);
  await deps.removeLegacy();
  for (const { brandId, ...timing } of schedules) {
    await deps.sync(brandId, timing);
  }
  return schedules.filter((schedule) => schedule.isEnabled).length;
}

// Retries until it succeeds or the worker stops: the calculation workers keep serving manual runs meanwhile.
export async function reconcileWithRetry(pool: Pool, isStopping: () => boolean): Promise<void> {
  let delay = FIRST_RETRY_MS;
  while (!isStopping()) {
    try {
      const enabled = await reconcileCalculationSchedules(pool);
      console.log(`[worker] calculation schedules reconciled: ${enabled} brands scheduled`);
      return;
    } catch (error) {
      console.error(`[worker] reconciling calculation schedules failed, retrying in ${delay / 1000}s: `, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, MAX_RETRY_MS);
    }
  }
}
