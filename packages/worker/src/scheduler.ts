import { customerScoringQueue, outletScoringQueue } from "./queue.js";

/** Registers a nightly repeatable job for one outlet. Call once per outlet at deploy/setup time. */
export async function scheduleOutletScoring(outletId: string): Promise<void> {
  await outletScoringQueue.upsertJobScheduler(
    `outlet-scoring-${outletId}`, // scheduler id — stable, so re-registering doesn't duplicate
    { pattern: "0 2 * * *" }, // 02:00 daily
    { data: { outletId } },
  );
}

export async function scheduleCUstomerScoring(
  customerId: string,
): Promise<void> {
  await customerScoringQueue.upsertJobScheduler(
    `customer-scoring-${customerId}`,
    { pattern: "0 3  * * *" },
    { data: { customerId } },
  );
}
