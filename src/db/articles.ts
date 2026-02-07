import Database from 'better-sqlite3';
import type { NormalizedArticle } from '../dbpia/types.js';

export interface ArticleRow {
  id: string;
  title: string;
  authors: string;
  journal: string;
  pub_year: number;
  raw_json: string;
  fulltext?: string;
  pdf_path?: string;
  download_status?: 'pending' | 'downloaded' | 'unavailable';
  downloaded_at?: string;
}

export function upsertArticles(db: Database.Database, items: NormalizedArticle[]): void {
  const upsert = db.prepare(`
    INSERT INTO articles (id, title, authors, journal, pub_year, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      authors = excluded.authors,
      journal = excluded.journal,
      pub_year = excluded.pub_year,
      raw_json = excluded.raw_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction((articles: NormalizedArticle[]) => {
    for (const article of articles) {
      upsert.run(
        article.id,
        article.title,
        JSON.stringify(article.authors),
        article.publisher || null,
        article.year ? parseInt(article.year, 10) : null,
        JSON.stringify(article.raw_json ?? {})
      );
    }
  });

  transaction(items);
}

export function getArticleById(db: Database.Database, id: string): ArticleRow | undefined {
  return db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as ArticleRow | undefined;
}

export function getArticleByNodeId(db: Database.Database, nodeId: string): ArticleRow | undefined {
  return db
    .prepare("SELECT * FROM articles WHERE raw_json LIKE ? OR raw_json LIKE ? LIMIT 1")
    .get(`%nodeId=${nodeId}%`, `%\"id\":\"${nodeId}\"%`) as ArticleRow | undefined;
}

export function getArticleNodeId(article: Pick<ArticleRow, 'id'> & { raw_json?: string | null }): string {
  if (article.id.startsWith('NODE')) {
    return article.id;
  }

  const rawJsonText = typeof article.raw_json === 'string' ? article.raw_json : '';

  if (!rawJsonText) {
    return article.id;
  }

  try {
    const raw = JSON.parse(rawJsonText) as Record<string, unknown>;
    const rawId = typeof raw.id === 'string' ? raw.id : undefined;
    if (rawId && rawId.startsWith('NODE')) {
      return rawId;
    }

    const linkUrl = typeof raw.link_url === 'string' ? raw.link_url : undefined;
    if (linkUrl) {
      const match = linkUrl.match(/nodeId=(NODE\d+)/);
      if (match?.[1]) {
        return match[1];
      }
    }
  } catch {
    // fallback to regex on raw JSON text
  }

  const fallbackMatch = rawJsonText.match(/nodeId=(NODE\d+)/);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1];
  }

  return article.id;
}

export function resolveArticleByAnyId(db: Database.Database, idOrNodeId: string): ArticleRow | undefined {
  return getArticleById(db, idOrNodeId) ?? getArticleByNodeId(db, idOrNodeId);
}

export function saveFulltext(db: Database.Database, articleId: string, fulltext: string): void {
  db.prepare('UPDATE articles SET fulltext = ? WHERE id = ?').run(fulltext, articleId);
}

export function searchFulltext(db: Database.Database, query: string, limit: number = 20): ArticleRow[] {
  const tableInfo = db.pragma('table_info(articles)') as { name: string }[];
  const hasFulltextColumn = tableInfo.some(col => col.name === 'fulltext');
  
  if (!hasFulltextColumn) {
    return [];
  }

  return db.prepare(`
    SELECT * FROM articles 
    WHERE fulltext LIKE ? 
    ORDER BY pub_year DESC 
    LIMIT ?
  `).all(`%${query}%`, limit) as ArticleRow[];
}
