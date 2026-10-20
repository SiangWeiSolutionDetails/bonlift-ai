import { Queue } from "bullmq";
import { getRedisConnection } from "../connection.js";

// Every calculation queue carries only the run ID; the run row holds everything else.
export interface CalculationJobData {
  runId: string;
}

// Returns a getter, so the Queue (and its Redis connection) is only created on first use.
export function lazyQueue<T>(name: string): () => Queue<T> {
  let queue: Queue<T> | undefined;
  return () => {
    queue ??= new Queue<T>(name, { connection: getRedisConnection() });
    return queue;
  };
}
