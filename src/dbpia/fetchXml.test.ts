import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { fetchDbpiaXml, buildDbpiaUrl, DEFAULT_BASE_URL } from './fetchXml.js';
import iconv from 'iconv-lite';

describe('fetchXml', () => {
  let mockAgent: MockAgent;
  let originalDispatcher: any;

  beforeAll(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    originalDispatcher = getGlobalDispatcher();
    setGlobalDispatcher(mockAgent);
  });

  afterAll(async () => {
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
  });

  describe('buildDbpiaUrl', () => {
    it('should build URL with parameters', () => {
      const url = buildDbpiaUrl({ q: 'test', key: 'secret' });
      expect(url).toBe(`${DEFAULT_BASE_URL}/v2/search/search.xml?q=test&key=secret`);
    });

    it('should skip undefined parameters', () => {
      const url = buildDbpiaUrl({ q: 'test', key: undefined });
      expect(url).toBe(`${DEFAULT_BASE_URL}/v2/search/search.xml?q=test`);
    });

    it('should use custom baseUrl', () => {
      const url = buildDbpiaUrl({ q: 'test' }, 'http://custom.api');
      expect(url).toBe('http://custom.api/v2/search/search.xml?q=test');
    });
  });

  describe('fetchDbpiaXml', () => {
    it('should fetch XML successfully', async () => {
      const mockPool = mockAgent.get(DEFAULT_BASE_URL);
      mockPool.intercept({
        path: /^\/v2\/search\/search\.xml/,
        method: 'GET',
      }).reply(200, '<root>success</root>', {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' }
      });

      const result = await fetchDbpiaXml({ q: 'test' });
      expect(result.status).toBe(200);
      expect(result.xml).toBe('<root>success</root>');
    });

    it('should decode EUC-KR charset correctly', async () => {
      const eucKrContent = iconv.encode('<root>한글</root>', 'euc-kr');
      const mockPool = mockAgent.get(DEFAULT_BASE_URL);
      mockPool.intercept({
        path: /^\/v2\/search\/search\.xml/,
        method: 'GET',
      }).reply(200, eucKrContent, {
        headers: { 'Content-Type': 'application/xml; charset=euc-kr' }
      });

      const result = await fetchDbpiaXml({ q: 'test' });
      expect(result.xml).toBe('<root>한글</root>');
    });

    it('should retry on 500 error', async () => {
      const mockPool = mockAgent.get(DEFAULT_BASE_URL);
      
      mockPool.intercept({
        path: /^\/v2\/search\/search\.xml/,
        method: 'GET',
      }).reply(500, 'Internal Server Error');

      mockPool.intercept({
        path: /^\/v2\/search\/search\.xml/,
        method: 'GET',
      }).reply(200, '<root>retry success</root>');

      const result = await fetchDbpiaXml({ q: 'test' }, { retryBackoffMs: 10 });
      expect(result.status).toBe(200);
      expect(result.xml).toBe('<root>retry success</root>');
    });

    it('should fail after max retries', async () => {
      const mockPool = mockAgent.get(DEFAULT_BASE_URL);
      
      mockPool.intercept({
        path: /^\/v2\/search\/search\.xml/,
        method: 'GET',
      }).reply(500, 'Error').times(3);

      await expect(fetchDbpiaXml({ q: 'test' }, { maxRetries: 2, retryBackoffMs: 10 }))
        .rejects.toThrow('HTTP Error: 500');
    });

    it('should retry on timeout', async () => {
      const mockPool = mockAgent.get(DEFAULT_BASE_URL);
      
      mockPool.intercept({
        path: /^\/v2\/search\/search\.xml/,
        method: 'GET',
      }).reply(200, '<root>too late</root>').delay(100);

      mockPool.intercept({
        path: /^\/v2\/search\/search\.xml/,
        method: 'GET',
      }).reply(200, '<root>on time</root>');

      const result = await fetchDbpiaXml({ q: 'test' }, { timeoutMs: 50, retryBackoffMs: 10 });
      expect(result.xml).toBe('<root>on time</root>');
    });

    it('should not retry on 401 error', async () => {
      const mockPool = mockAgent.get(DEFAULT_BASE_URL);
      
      mockPool.intercept({
        path: /^\/v2\/search\/search\.xml/,
        method: 'GET',
      }).reply(401, 'Unauthorized');

      await expect(fetchDbpiaXml({ q: 'test' })).rejects.toThrow('HTTP Error: 401');
    });
  });
});
