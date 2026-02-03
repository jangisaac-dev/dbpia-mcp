import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { openDb, migrate } from '../src/db/index.js';
import { upsertArticles } from '../src/db/articles.js';
import { getCachedQuery, setCachedQuery, makeCacheKey, computeExpiresAt } from '../src/db/queryCache.js';
import { runQuery } from '../src/dbpia/runQuery.js';
import { mockAgent } from './setup.js';
import fs from 'fs';
import path from 'path';

describe('Database and Cache Operations', () => {
  let db: Database.Database;
  const dbDir = './test_db';

  beforeEach(() => {
    if (fs.existsSync(dbDir)) {
      fs.rmSync(dbDir, { recursive: true });
    }
    db = openDb({ dbDir });
    migrate(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbDir)) {
      fs.rmSync(dbDir, { recursive: true });
    }
  });

  it('upsertArticles should insert and update articles', () => {
    const articles = [
      {
        id: 'A1',
        title: 'Title 1',
        authors: ['Author 1'],
        publisher: 'Journal 1',
        year: '2023',
        raw_json: { some: 'data' }
      }
    ] as any;

    upsertArticles(db, articles);
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get('A1') as any;
    expect(row.title).toBe('Title 1');
    expect(JSON.parse(row.authors)).toEqual(['Author 1']);

    const updatedArticles = [
      {
        id: 'A1',
        title: 'Updated Title',
        authors: ['Author 1', 'Author 2'],
        publisher: 'Journal 1',
        year: '2023',
        raw_json: { some: 'new data' }
      }
    ] as any;

    upsertArticles(db, updatedArticles);
    const updatedRow = db.prepare('SELECT * FROM articles WHERE id = ?').get('A1') as any;
    expect(updatedRow.title).toBe('Updated Title');
    expect(JSON.parse(updatedRow.authors)).toEqual(['Author 1', 'Author 2']);
  });

  it('queryCache should handle set and get', () => {
    const cacheKey = 'key1';
    const expiresAt = computeExpiresAt(7);
    const record = {
      cache_key: cacheKey,
      tool: 'test-tool',
      params_json: JSON.stringify({ q: 'test' }),
      result_json: JSON.stringify({ items: [] }),
      expires_at: expiresAt
    };

    setCachedQuery(db, record);
    const cached = getCachedQuery(db, cacheKey);
    expect(cached).not.null;
    expect(cached?.tool).toBe('test-tool');
  });

  it('queryCache should not return expired records', () => {
    const cacheKey = 'expired-key';
    const expiresAt = '2000-01-01 00:00:00';
    const record = {
      cache_key: cacheKey,
      tool: 'test-tool',
      params_json: JSON.stringify({ q: 'test' }),
      result_json: JSON.stringify({ items: [] }),
      expires_at: expiresAt
    };

    setCachedQuery(db, record);
    const cached = getCachedQuery(db, cacheKey);
    expect(cached).toBeNull();
  });

  it('runQuery should use cache on hit', async () => {
    const fixturePath = path.join(__dirname, 'fixtures/dbpia/search_se.xml');
    const xml = fs.readFileSync(fixturePath, 'utf-8');
    
    const client = mockAgent.get('http://api.dbpia.co.kr');
    client.intercept({
      path: (p) => p.includes('/v2/search/search.xml'),
      method: 'GET',
    }).reply(200, xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });

    const options = {
      db,
      tool: 'test-tool',
      target: 'se' as const,
      params: { q: 'test' }
    };

    const res1 = await runQuery(options);
    expect(res1.items[0].id).toBe('NODE01234567');

    const res2 = await runQuery(options);
    expect(res2.items[0].id).toBe('NODE01234567');
  });

  it('runQuery should bypass cache when refresh=true', async () => {
    const fixturePath = path.join(__dirname, 'fixtures/dbpia/search_se.xml');
    const xml = fs.readFileSync(fixturePath, 'utf-8');
    
    const client = mockAgent.get('http://api.dbpia.co.kr');
    
    client.intercept({
      path: (p) => p.includes('/v2/search/search.xml'),
      method: 'GET',
    }).reply(200, xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });

    client.intercept({
      path: (p) => p.includes('/v2/search/search.xml'),
      method: 'GET',
    }).reply(200, xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });

    const options = {
      db,
      tool: 'test-tool',
      target: 'se' as const,
      params: { q: 'test' }
    };

    await runQuery(options);
    await runQuery({ ...options, refresh: true });
  });
});
