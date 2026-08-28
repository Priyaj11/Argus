import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// The connection to Redis (running in Docker on port 6379).
/* v8 ignore next 3 -- local development default, never taken under test */
export const connection = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null } // required by BullMQ
);

// A named queue — think of it as a labeled to-do list called "reviews".
export const reviewQueue = new Queue('reviews', { connection });
