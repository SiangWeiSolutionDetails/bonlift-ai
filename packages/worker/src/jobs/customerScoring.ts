import { Job } from "bullmq";
import { CustomerScoringJobData } from "../queue.js";

export async function processCustomerScoringJob(
  job: Job<CustomerScoringJobData>,
) {

    throw new Error()
}
