export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  maxQueueDelayMs?: number;
}

export class RateLimiterError extends Error {
  code = 'RATE_LIMITED';
  constructor(message: string) {
    super(message);
    this.name = 'RateLimiterError';
  }
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { limit, windowMs, maxQueueDelayMs = 10000 } = options;
  const queue: { resolve: (val: { queuedMs: number }) => void; reject: (err: any) => void; ts: number }[] = [];
  let timestamps: number[] = [];
  let timeout: NodeJS.Timeout | null = null;

  function cleanup() {
    const now = Date.now();
    timestamps = timestamps.filter(ts => ts > now - windowMs);
  }

  function processQueue() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    cleanup();

    const now = Date.now();
    while (queue.length > 0 && timestamps.length < limit) {
      const item = queue.shift();
      if (item) {
        timestamps.push(now);
        item.resolve({ queuedMs: now - item.ts });
      }
    }

    if (queue.length > 0) {
      const oldestTimestamp = timestamps[0];
      const nextAvailableAt = oldestTimestamp + windowMs;
      const delay = Math.max(0, nextAvailableAt - now);
      timeout = setTimeout(processQueue, delay);
    }
  }

  return {
    async acquire(): Promise<{ queuedMs: number }> {
      cleanup();
      const now = Date.now();

      if (timestamps.length < limit && queue.length === 0) {
        timestamps.push(now);
        return { queuedMs: 0 };
      }

      const queueIndex = queue.length;
      
      let estimatedWait = 0;
      if (timestamps.length >= limit) {
        const referenceTs = timestamps[queueIndex % limit] || timestamps[0];
        estimatedWait = Math.max(0, referenceTs + windowMs - now);
      }
      
      const extraWindows = Math.floor(queueIndex / limit);
      estimatedWait += extraWindows * windowMs;

      if (estimatedWait > maxQueueDelayMs) {
        throw new RateLimiterError(`Rate limit exceeded. Estimated wait: ${estimatedWait}ms`);
      }

      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject, ts: now });
        processQueue();
      });
    },

    async schedule<T>(fn: () => Promise<T>): Promise<T> {
      await this.acquire();
      return fn();
    }
  };
}
