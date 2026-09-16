import { customerScoringQueue } from "../queue.js";

const customerId = process.argv[2];

if (!customerId) {
  console.error("Usage: npm run rescore:customer -w packages/worker -- <customerId>");
  process.exit(1);
}

const job = await customerScoringQueue.add("manual-rescore", { customerId });
console.log(`Enqueued job ${job.id} for customer ${customerId}`);

await customerScoringQueue.close();
process.exit(0);