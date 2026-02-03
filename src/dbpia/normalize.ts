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
    // Extract authors - handle both array and single object cases
    const authorData = item.authors?.author;
    const authorArray = Array.isArray(authorData) ? authorData : (authorData ? [authorData] : []);
    const authors = authorArray.map((a: any) => {
      if (typeof a === 'string') return a;
      if (typeof a === 'object') {
        // DBpia returns author as object with 'name' property
        return a.name || a['#text'] || '';
      }
      return String(a);
    }).filter((name: string) => name.length > 0);

    // Extract year from pub_date or issue.yymm
    let year: string | undefined;
    if (item.pub_date) {
      year = String(item.pub_date).substring(0, 4);
    } else if (item.issue?.yymm) {
      // Format: "2019. 12. 30" -> extract year
      const match = String(item.issue.yymm).match(/(\d{4})/);
      year = match ? match[1] : undefined;
    }

    // Extract publisher - handle object with 'name' property
    let publisher: string | undefined;
    if (typeof item.publisher === 'string') {
      publisher = item.publisher;
    } else if (typeof item.publisher === 'object' && item.publisher?.name) {
      publisher = item.publisher.name;
    }

    const normalized: Partial<NormalizedArticle> = {
      title: item.title || '',
      authors,
      year,
      publisher,
      url: item.link || item.link_url,
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
