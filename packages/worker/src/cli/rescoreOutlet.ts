import { outletScoringQueue } from "../queue.js";

const outletId = process.argv[2];

if (!outletId) {
  console.error("Usage: npm run rescore -w packages/worker -- <outletId>");
  process.exit(1);
}

const job = await outletScoringQueue.add("manual-rescore", { outletId });
console.log(`Enqueued job ${job.id} for outlet ${outletId}`);

await outletScoringQueue.close();
process.exit(0);
