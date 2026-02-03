import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { localSearch } from '../db/localSearch.js';
import { exportToJsonl } from './jsonl.js';
import { upsertArticles } from '../db/articles.js';
import fs from 'fs';
import path from 'path';

describe('Tools logic', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE articles (
        id TEXT PRIMARY KEY,
        title TEXT,
        authors TEXT,
        journal TEXT,
        pub_year INTEGER,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('localSearch', () => {
    it('should return articles matching title', () => {
      const articles = [
        {
          id: '1',
          title: 'Deep Learning for MCP',
          authors: ['John Doe'],
          year: '2025',
          publisher: 'Tech Journal',
          raw_json: { abstract: 'Testing MCP' }
        }
      ] as any;
      upsertArticles(db, articles);

      const results = localSearch(db, 'MCP');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Deep Learning for MCP');
    });

    it('should return articles matching authors', () => {
      const articles = [
        {
          id: '1',
          title: 'AI in 2026',
          authors: ['Alice', 'Bob'],
          year: '2026',
          publisher: 'AI Press',
          raw_json: {}
        }
      ] as any;
      upsertArticles(db, articles);

      const results = localSearch(db, 'Alice');
      expect(results).toHaveLength(1);
      expect(results[0].authors).toContain('Alice');
    });
  });

  describe('exportToJsonl', () => {
    it('should write articles to JSONL file', () => {
      const articles = [
        {
          id: '1',
          title: 'Article 1',
          authors: ['A'],
          year: '2024',
          publisher: 'P',
          raw_json: { key: 'val' }
        }
      ] as any;
      upsertArticles(db, articles);

      const testOutputPath = path.join(process.cwd(), 'test_export.jsonl');
      try {
        const result = exportToJsonl(db, testOutputPath);
        expect(result.count).toBe(1);
        
        const content = fs.readFileSync(testOutputPath, 'utf-8');
        const parsed = JSON.parse(content.trim());
        expect(parsed.id).toBe('1');
        expect(parsed.title).toBe('Article 1');
      } finally {
        if (fs.existsSync(testOutputPath)) fs.unlinkSync(testOutputPath);
      }
    });
  });
});
