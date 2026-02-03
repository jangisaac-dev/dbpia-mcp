import { describe, it, expect } from 'vitest';
import { Mutex } from './mutex.js';

describe('Mutex', () => {
  it('should run tasks sequentially', async () => {
    const mutex = new Mutex();
    const results: number[] = [];

    const task = async (id: number, delay: number) => {
      await mutex.runExclusive(async () => {
        results.push(id);
        await new Promise(resolve => setTimeout(resolve, delay));
        results.push(id);
      });
    };

    await Promise.all([
      task(1, 50),
      task(2, 10)
    ]);

    expect(results).toEqual([1, 1, 2, 2]);
  });
});
