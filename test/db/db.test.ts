import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, migrate } from '../../src/db';
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
    expect(version.version).toBe(1);

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
