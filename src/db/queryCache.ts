import Database from 'better-sqlite3';
import { createHash } from 'crypto';

export interface CachedQuery {
  cache_key: string;
  tool: string;
  params_json: string;
  result_json: string;
  fetched_at?: string;
  expires_at: string;
}

export function makeCacheKey(data: {
  tool: string;
  target: string;
  params: Record<string, any>;
  page?: number;
  pagecount?: number;
}): string {
  const { tool, target, params, page, pagecount } = data;
  
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {} as Record<string, any>);

  const canonical = {
    tool,
    target,
    params: sortedParams,
    page: page ?? 1,
    pagecount: pagecount ?? 20
  };

  return createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex');
}

export function getCachedQuery(db: Database.Database, cacheKey: string): CachedQuery | null {
  const row = db.prepare(`
    SELECT cache_key, tool, params_json, result_json, fetched_at, expires_at
    FROM query_cache
    WHERE cache_key = ? AND expires_at > CURRENT_TIMESTAMP
  `).get(cacheKey) as CachedQuery | undefined;

  return row || null;
}

export function setCachedQuery(db: Database.Database, record: Omit<CachedQuery, 'fetched_at'>): void {
  db.prepare(`
    INSERT INTO query_cache (cache_key, tool, params_json, result_json, expires_at, fetched_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(cache_key) DO UPDATE SET
      tool = excluded.tool,
      params_json = excluded.params_json,
      result_json = excluded.result_json,
      expires_at = excluded.expires_at,
      fetched_at = CURRENT_TIMESTAMP
  `).run(
    record.cache_key,
    record.tool,
    record.params_json,
    record.result_json,
    record.expires_at
  );
}

export function computeExpiresAt(ttlDays: number = 7): string {
  const date = new Date();
  date.setDate(date.getDate() + ttlDays);
  return date.toISOString().replace('T', ' ').substring(0, 19);
}
