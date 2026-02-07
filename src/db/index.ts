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
  {
    id: 2,
    name: 'session_and_pdf_metadata',
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cookies_json TEXT,
        auth_type TEXT CHECK(auth_type IN ('institution', 'personal', 'unknown')),
        institution_name TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS external_pdfs (
        id TEXT PRIMARY KEY,
        title TEXT,
        authors TEXT,
        year INTEGER,
        source TEXT,
        pdf_path TEXT,
        fulltext TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_external_pdfs_title ON external_pdfs(title);
    `,
  },
];

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.pragma(`table_info(${table})`) as { name: string }[];
  return cols.some(c => c.name === column);
}

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

    if (!columnExists(db, 'articles', 'fulltext')) {
      db.exec('ALTER TABLE articles ADD COLUMN fulltext TEXT');
    }
    if (!columnExists(db, 'articles', 'pdf_path')) {
      db.exec('ALTER TABLE articles ADD COLUMN pdf_path TEXT');
    }
    if (!columnExists(db, 'articles', 'download_status')) {
      db.exec("ALTER TABLE articles ADD COLUMN download_status TEXT CHECK(download_status IN ('pending', 'downloaded', 'unavailable')) DEFAULT 'pending'");
    }
    if (!columnExists(db, 'articles', 'downloaded_at')) {
      db.exec('ALTER TABLE articles ADD COLUMN downloaded_at DATETIME');
    }
  })();
}
