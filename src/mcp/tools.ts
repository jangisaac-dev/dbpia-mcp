import Database from 'better-sqlite3';
import { runQuery } from '../dbpia/runQuery.js';
import { localSearch } from '../db/localSearch.js';
import { exportToJsonl } from '../export/jsonl.js';

const WHITELISTED_PARAMS = [
  'searchall', 'searchauthor', 'searchpublisher', 'searchbook',
  'pyear', 'pmonth', 'category',
  'freeyn', 'priceyn', 'sorttype', 'sortorder',
  'pyear_start', 'pyear_end', 'itype', 'collection'
];

function filterParams(params: Record<string, any> = {}): Record<string, any> {
  const filtered: Record<string, any> = {};
  for (const key of WHITELISTED_PARAMS) {
    if (params[key] !== undefined) {
      filtered[key] = params[key];
    }
  }

  if (filtered.itype && filtered.collection) {
    throw new Error('itype and collection are mutually exclusive');
  }

  return filtered;
}

export async function handleSearch(db: Database.Database, args: any) {
  const { extraParams, refresh, page, pagecount, ...core } = args;
  const params = { ...filterParams(core), ...filterParams(extraParams) };

  const result = await runQuery({
    db,
    tool: 'dbpia_search',
    target: 'se',
    params,
    page,
    pagecount,
    refresh
  });

  return {
    content: [{ type: 'text' as const, text: `Found ${result.items.length} articles.` }],
    structuredContent: result as any
  };
}

export async function handleAdvancedSearch(db: Database.Database, args: any) {
  const { extraParams, refresh, page, pagecount, ...core } = args;
  const params = { ...filterParams(core), ...filterParams(extraParams) };

  const result = await runQuery({
    db,
    tool: 'dbpia_search_advanced',
    target: 'se_adv',
    params,
    page,
    pagecount,
    refresh
  });

  return {
    content: [{ type: 'text' as const, text: `Found ${result.items.length} articles via advanced search.` }],
    structuredContent: result as any
  };
}

export async function handleTopPapers(db: Database.Database, args: any) {
  const { extraParams, refresh, page, pagecount, ...core } = args;
  const params = { ...filterParams(core), ...filterParams(extraParams) };

  if (params.pyear && !params.pmonth) {
    throw new Error('pmonth is required when pyear is provided for top papers');
  }

  const result = await runQuery({
    db,
    tool: 'dbpia_top_papers',
    target: 'rated_art',
    params,
    page,
    pagecount,
    refresh
  });

  return {
    content: [{ type: 'text' as const, text: `Found ${result.items.length} top papers.` }],
    structuredContent: result as any
  };
}

export async function handleLocalSearch(db: Database.Database, args: any) {
  const { query, remoteFallback, page, pagecount } = args;
  let items = localSearch(db, query);

  if (items.length === 0 && remoteFallback) {
    const result = await runQuery({
      db,
      tool: 'dbpia_local_search_fallback',
      target: 'se_adv',
      params: { searchall: query },
      page,
      pagecount
    });
    items = result.items;
  }

  return {
    content: [{ type: 'text' as const, text: `Found ${items.length} articles locally${items.length === 0 && remoteFallback ? ' (after remote fallback)' : ''}.` }],
    structuredContent: { items } as any
  };
}

export async function handleExport(db: Database.Database, args: any) {
  const { outputPath } = args;
  const result = exportToJsonl(db, outputPath);

  return {
    content: [{ type: 'text' as const, text: `Exported ${result.count} articles to ${result.path}` }],
    structuredContent: result as any
  };
}

export async function handleDetail(db: Database.Database, args: any) {
  const { id, refresh } = args;
  
  const businessKey = process.env.DBPIA_BUSINESS_API_KEY;

  const result = await runQuery({
    db,
    tool: 'dbpia_detail',
    target: 'detail',
    params: { id },
    refresh,
    apiKeyOverride: businessKey
  });

  return {
    content: [{ type: 'text' as const, text: `Retrieved details for article ${id}.` }],
    structuredContent: result as any
  };
}
