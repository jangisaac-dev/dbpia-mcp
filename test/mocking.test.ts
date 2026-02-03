import { describe, it, expect } from 'vitest';
import { mockAgent } from './setup';

describe('HTTP Mocking', () => {
  it('should successfully mock a request', async () => {
    const client = mockAgent.get('https://api.dbpia.co.kr');
    client.intercept({
      path: '/v2/search/se.xml',
      method: 'GET',
    }).reply(200, '<root>mocked</root>');

    const response = await fetch('https://api.dbpia.co.kr/v2/search/se.xml');
    const text = await response.text();
    expect(text).toBe('<root>mocked</root>');
  });

  it('should fail if no interceptor matches', async () => {
    await expect(fetch('https://api.dbpia.co.kr/unmocked')).rejects.toThrow();
  });
});
