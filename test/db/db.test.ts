import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, migrate, migrations } from '../../src/db';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

describe('Database and Migrations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbpia-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create database directory if missing', () => {
    const missingDir = path.join(tempDir, 'missing');
    const db = openDb({ dbDir: missingDir });
    expect(fs.existsSync(missingDir)).toBe(true);
    expect(fs.existsSync(path.join(missingDir, 'dbpia.sqlite'))).toBe(true);
    db.close();
  });

  it('should run migrations and create tables', () => {
    const db = openDb({ dbDir: tempDir });
    migrate(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('schema_version');
    expect(tableNames).toContain('articles');
    expect(tableNames).toContain('query_cache');

    const version = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
    expect(version.version).toBe(2);

    db.close();
  });

  it('should have new columns in articles table', () => {
    const db = openDb({ dbDir: tempDir });
    migrate(db);

    const cols = db.pragma('table_info(articles)') as { name: string }[];
    const colNames = cols.map(c => c.name);

    expect(colNames).toContain('fulltext');
    expect(colNames).toContain('pdf_path');
    expect(colNames).toContain('download_status');
    expect(colNames).toContain('downloaded_at');

    db.close();
  });

  it('should create sessions and external_pdfs tables', () => {
    const db = openDb({ dbDir: tempDir });
    migrate(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('external_pdfs');

    db.close();
  });

  it('should support CRUD on sessions table', () => {
    const db = openDb({ dbDir: tempDir });
    migrate(db);

    const session = {
      id: 'session-1',
      cookies_json: JSON.stringify([{ name: 'test', value: '123' }]),
      auth_type: 'institution',
      institution_name: 'Test Univ',
      expires_at: '2026-12-31 23:59:59'
    };

    db.prepare(`
      INSERT INTO sessions (id, cookies_json, auth_type, institution_name, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(session.id, session.cookies_json, session.auth_type, session.institution_name, session.expires_at);

    const saved = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id) as any;
    expect(saved.id).toBe(session.id);
    expect(saved.auth_type).toBe(session.auth_type);
    expect(saved.institution_name).toBe(session.institution_name);

    db.close();
  });

  it('should support CRUD on external_pdfs table', () => {
    const db = openDb({ dbDir: tempDir });
    migrate(db);

    const pdf = {
      id: 'pdf-1',
      title: 'External Paper',
      authors: 'Author A',
      year: 2025,
      source: 'Google Scholar',
      pdf_path: '/path/to/pdf',
      fulltext: 'Extracted text'
    };

    db.prepare(`
      INSERT INTO external_pdfs (id, title, authors, year, source, pdf_path, fulltext)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(pdf.id, pdf.title, pdf.authors, pdf.year, pdf.source, pdf.pdf_path, pdf.fulltext);

    const saved = db.prepare('SELECT * FROM external_pdfs WHERE id = ?').get(pdf.id) as any;
    expect(saved.id).toBe(pdf.id);
    expect(saved.title).toBe(pdf.title);
    expect(saved.fulltext).toBe(pdf.fulltext);

    db.close();
  });

  it('should be idempotent (running migrations twice)', () => {
    const db = openDb({ dbDir: tempDir });
    migrate(db);
    const firstVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
    
    migrate(db);
    const secondVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number };

    expect(firstVersion.version).toBe(secondVersion.version);
    db.close();
  });

  it('should enable foreign keys', () => {
    const db = openDb({ dbDir: tempDir });
    const result = db.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
    db.close();
  });
});
