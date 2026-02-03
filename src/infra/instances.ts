import { createRateLimiter } from './rateLimiter.js';
import { Mutex } from './mutex.js';

const limit = process.env.DBPIA_RATE_LIMIT_PER_MINUTE ? parseInt(process.env.DBPIA_RATE_LIMIT_PER_MINUTE, 10) : 60;

export const dbpiaLimiter = createRateLimiter({
  limit,
  windowMs: 60 * 1000,
  maxQueueDelayMs: 10000
});

export const dbWriteMutex = new Mutex();
