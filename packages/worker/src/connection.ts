import { Redis } from "ioredis";

let connection: Redis | undefined;
let schedulerConnection: Redis | undefined;

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return url;
}

export function getRedisConnection(): Redis {
  connection ??= new Redis(redisUrl(), { maxRetriesPerRequest: null });
  return connection;
}

// For schedule writes made while serving an admin request: a command fails instead of waiting for Redis to come back
// (no offline queue, one retry). Workers keep getRedisConnection, whose blocking commands need infinite retries.
export function getSchedulerRedisConnection(): Redis {
  if (!schedulerConnection) {
    schedulerConnection = new Redis(redisUrl(), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
    });
    // Failures reach the caller through the rejected command; without a listener ioredis logs every reconnect attempt.
    schedulerConnection.on("error", () => undefined);
  }
  return schedulerConnection;
}

export async function closeRedisConnections(): Promise<void> {
  await Promise.all([connection?.quit(), schedulerConnection?.quit()]);
}
