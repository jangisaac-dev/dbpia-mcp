import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function exportToJsonl(db: Database.Database, outputPath: string): { count: number; path: string } {
  const absolutePath = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
  const dir = path.dirname(absolutePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stmt = db.prepare('SELECT * FROM articles');
  const rows = stmt.all() as any[];

  const lines: string[] = [];
  for (const row of rows) {
    const data = {
      id: row.id,
      title: row.title,
      authors: JSON.parse(row.authors || '[]'),
      journal: row.journal,
      pub_year: row.pub_year,
      raw_json: JSON.parse(row.raw_json || '{}'),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
    lines.push(JSON.stringify(data));
  }

  fs.writeFileSync(absolutePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));

  return {
    count: rows.length,
    path: absolutePath
  };
}
