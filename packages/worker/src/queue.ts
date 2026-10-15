import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.js";

export interface OutletScoringJobData {
  outletId: string;
}

export const OUTLET_SCORING_QUEUE_NAME = "outlet-scoring";

export const outletScoringQueue = new Queue<OutletScoringJobData>(
  OUTLET_SCORING_QUEUE_NAME,
  {
    connection: getRedisConnection(),
  },
);
