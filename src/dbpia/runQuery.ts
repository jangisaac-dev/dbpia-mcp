import Database from 'better-sqlite3';
import { fetchDbpiaXml } from './fetchXml.js';
import { parseDbpiaXml } from './parseXml.js';
import { normalizeDbpiaResponse } from './normalize.js';
import { upsertArticles } from '../db/articles.js';
import { getCachedQuery, setCachedQuery, makeCacheKey, computeExpiresAt } from '../db/queryCache.js';
import type { DbpiaNormalizationResult } from './types.js';
import { dbpiaLimiter, dbWriteMutex } from '../infra/instances.js';

export interface RunQueryOptions {
  db: Database.Database;
  tool: string;
  target: 'se' | 'se_adv' | 'rated_art' | 'detail';
  params: Record<string, any>;
  page?: number;
  pagecount?: number;
  refresh?: boolean;
  apiKeyOverride?: string;
}

export async function runQuery(options: RunQueryOptions): Promise<DbpiaNormalizationResult> {
  const { db, tool, target, params, page, pagecount, refresh = false, apiKeyOverride } = options;

  const cacheKey = makeCacheKey({ tool, target, params, page, pagecount });

  if (!refresh) {
    const cached = getCachedQuery(db, cacheKey);
    if (cached) {
      return JSON.parse(cached.result_json) as DbpiaNormalizationResult;
    }
  }

  const queryParams: Record<string, any> = { ...params, target };
  if (page) queryParams.page = page;
  if (pagecount) queryParams.pagecount = pagecount;

  if (apiKeyOverride) {
    queryParams.key = apiKeyOverride;
  } else if (process.env.DBPIA_API_KEY) {
    queryParams.key = process.env.DBPIA_API_KEY;
  }

  const fetchResult = await dbpiaLimiter.schedule(() => fetchDbpiaXml(queryParams));
  const parsed = parseDbpiaXml(fetchResult.xml);
  const normalized = normalizeDbpiaResponse(parsed, target);

  await dbWriteMutex.runExclusive(async () => {
    upsertArticles(db, normalized.items);

    const ttlDays = process.env.DBPIA_QUERY_TTL_DAYS ? parseInt(process.env.DBPIA_QUERY_TTL_DAYS, 10) : 7;
    setCachedQuery(db, {
      cache_key: cacheKey,
      tool,
      params_json: JSON.stringify(params),
      result_json: JSON.stringify(normalized),
      expires_at: computeExpiresAt(ttlDays)
    });
  });

  return normalized;
}
