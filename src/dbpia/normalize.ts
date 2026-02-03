import { createHash } from 'crypto';
import type { NormalizedArticle, DbpiaNormalizationResult } from './types.js';

export function computeStableId(normalized: Partial<NormalizedArticle>, raw_json: any): string {
  if (raw_json?.id) return String(raw_json.id);
  if (raw_json?.doi) return String(raw_json.doi);

  const title = normalized.title || '';
  const authors = (normalized.authors || []).join(',');
  const year = normalized.year || '';
  const publisher = normalized.publisher || '';
  
  const seed = `${title}|${authors}|${year}|${publisher}`;
  return createHash('sha256').update(seed).digest('hex').substring(0, 16);
}

export function normalizeDbpiaResponse(
  parsed: any,
  target: 'se' | 'se_adv' | 'rated_art' | 'detail'
): DbpiaNormalizationResult {
  const root = parsed?.root;
  const status = root?.status;
  const result = root?.result;
  const rawItems = result?.items?.item || [];
  
  const items: NormalizedArticle[] = rawItems.map((item: any) => {
    const authors = Array.isArray(item.authors?.author) 
      ? item.authors.author.map((a: any) => typeof a === 'object' ? a['#text'] || '' : String(a))
      : [];

    const normalized: Partial<NormalizedArticle> = {
      title: item.title || '',
      authors,
      year: item.pub_date ? String(item.pub_date).substring(0, 4) : undefined,
      publisher: item.publisher,
      url: item.link,
      preview_url: item.preview_url,
      keywords: Array.isArray(item.keywords?.keyword) ? item.keywords.keyword : [],
      abstract: item.abstract || null,
      raw_json: item
    };

    return {
      ...normalized,
      id: computeStableId(normalized, item),
    } as NormalizedArticle;
  });

  return {
    items,
    raw_json: parsed,
    meta: {
      total: result?.total ? Number(result.total) : undefined,
      status: status ? {
        code: String(status.code),
        message: String(status.message)
      } : undefined
    }
  };
}
