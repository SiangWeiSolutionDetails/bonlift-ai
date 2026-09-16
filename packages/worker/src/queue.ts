import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.js";

export interface OutletScoringJobData {
  outletId: string;
}

export interface CustomerScoringJobData {
  customerId: string;
}

export const OUTLET_SCORING_QUEUE_NAME = "outlet-scoring";
export const CUSTOMER_SCORING_QUEUE_NAME = "customer-scoring";

export const outletScoringQueue = new Queue<OutletScoringJobData>(
  OUTLET_SCORING_QUEUE_NAME,
  {
    connection: getRedisConnection(),
  },
);

export const customerScoringQueue = new Queue<CustomerScoringJobData>(
  CUSTOMER_SCORING_QUEUE_NAME,
  {
    connection: getRedisConnection(),
  },
);
