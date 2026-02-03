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
