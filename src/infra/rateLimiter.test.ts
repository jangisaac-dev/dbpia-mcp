import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rateLimiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow calls within limit', async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    const fn = vi.fn().mockResolvedValue('ok');

    const p1 = limiter.schedule(fn);
    const p2 = limiter.schedule(fn);

    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(p1).resolves.toBe('ok');
    await expect(p2).resolves.toBe('ok');
  });

  it('should throttle calls exceeding limit', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    const fn = vi.fn().mockResolvedValue('ok');

    const p1 = limiter.schedule(fn);
    const p2 = limiter.schedule(fn);

    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    
    await vi.runAllTicks();
    
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(p1).resolves.toBe('ok');
    await expect(p2).resolves.toBe('ok');
  });

  it('should throw RATE_LIMITED if queue delay exceeds maxQueueDelayMs', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxQueueDelayMs: 500 });
    const fn = vi.fn().mockResolvedValue('ok');

    await limiter.schedule(fn);
    
    await expect(limiter.schedule(fn)).rejects.toThrow(/Rate limit exceeded/);
  });
});
