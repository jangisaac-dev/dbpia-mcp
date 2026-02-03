import Database from 'better-sqlite3';
import type { NormalizedArticle } from '../dbpia/types.js';

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
        JSON.stringify(article.raw_json)
      );
    }
  });

  transaction(items);
}
