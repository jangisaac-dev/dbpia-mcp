import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface OpenDbOptions {
  dbDir: string;
}

export function openDb({ dbDir }: OpenDbOptions): Database.Database {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'dbpia.sqlite');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT,
        authors TEXT,
        journal TEXT,
        pub_year INTEGER,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS query_cache (
        cache_key TEXT PRIMARY KEY,
        tool TEXT,
        params_json TEXT,
        result_json TEXT,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_articles_pub_year ON articles(pub_year);
      CREATE INDEX IF NOT EXISTS idx_query_cache_tool ON query_cache(tool);
    `,
  },
];

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.transaction(() => {
    const versionRow = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
    const currentVersion = versionRow?.version ?? 0;

    for (const migration of migrations) {
      if (migration.id > currentVersion) {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.id);
      }
    }
  })();
}
