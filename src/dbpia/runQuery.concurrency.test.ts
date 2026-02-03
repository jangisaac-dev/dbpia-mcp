import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runQuery } from './runQuery.js';
import * as fetchXmlModule from './fetchXml.js';

vi.mock('./fetchXml.js');

describe('runQuery Concurrency', () => {
  let db: Database.Database;
  const originalApiKey = process.env.DBPIA_API_KEY;

  beforeEach(() => {
    process.env.DBPIA_API_KEY = 'test-api-key';
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE articles (
        id TEXT PRIMARY KEY,
        title TEXT,
        authors TEXT,
        journal TEXT,
        pub_year INTEGER,
        raw_json TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE query_cache (
        cache_key TEXT PRIMARY KEY,
        tool TEXT,
        params_json TEXT,
        result_json TEXT,
        expires_at DATETIME,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.DBPIA_API_KEY = originalApiKey;
    db.close();
  });

  it('should handle concurrent runQuery calls without DB locking issues', async () => {
    const mockFetch = vi.mocked(fetchXmlModule.fetchDbpiaXml);
    
    mockFetch.mockImplementation(async (params: any) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        xml: `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <result>
    <items>
      <item>
        <target_id>${params.q || '1'}</target_id>
        <title>Title ${params.q || '1'}</title>
      </item>
    </items>
  </result>
</root>`
      };
    });

    await Promise.all([
      runQuery({ db, tool: 'test', target: 'se', params: { q: 'A' }, refresh: true }),
      runQuery({ db, tool: 'test', target: 'se', params: { q: 'B' }, refresh: true })
    ]);

    const articles = db.prepare('SELECT id FROM articles').all();
    expect(articles.length).toBe(2);
    
    const cache = db.prepare('SELECT cache_key FROM query_cache').all();
    expect(cache.length).toBe(2);
  });
});
