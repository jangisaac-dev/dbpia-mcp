import { describe, it, expect } from 'vitest';

describe('Network Guard', () => {
  it('should fail when making a real network call', async () => {
    await expect(fetch('https://google.com')).rejects.toThrow();
  });
});
