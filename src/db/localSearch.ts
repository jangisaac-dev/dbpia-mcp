import Database from 'better-sqlite3';
import { NormalizedArticle } from '../dbpia/types.js';

export function localSearch(db: Database.Database, query: string): NormalizedArticle[] {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return [];
  }

  const likeQuery = `%${query.trim()}%`;
  const stmt = db.prepare(`
    SELECT * FROM articles
    WHERE title LIKE ?
       OR authors LIKE ?
       OR raw_json LIKE ?
    ORDER BY pub_year DESC, updated_at DESC
  `);

  const rows = stmt.all(likeQuery, likeQuery, likeQuery) as any[];

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    authors: JSON.parse(row.authors || '[]'),
    year: row.pub_year ? String(row.pub_year) : undefined,
    publisher: row.journal,
    raw_json: JSON.parse(row.raw_json || '{}')
  }));
}
