import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { getRedisConnection } from "../connection.js";

// Every calculation queue carries only the run ID; the run row holds everything else.
export interface CalculationJobData {
  runId: string;
}

// Returns a getter, so the Queue (and its Redis connection) is only created on first use.
export function lazyQueue<T>(
  name: string,
  connection: () => Redis = getRedisConnection,
  onCreate?: (queue: Queue<T>) => void,
): () => Queue<T> {
  let queue: Queue<T> | undefined;
  return () => {
    if (!queue) {
      queue = new Queue<T>(name, { connection: connection() });
      onCreate?.(queue);
    }
    return queue;
  };
}
