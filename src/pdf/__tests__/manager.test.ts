import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { listPdfs, getPdfInfo, openPdfById, deletePdf, registerExternalPdf } from '../manager.js';
import * as fileOps from '../fileOps.js';

vi.mock('../fileOps.js', () => ({
  openPdf: vi.fn().mockResolvedValue({ success: true, message: 'Opened' }),
  deletePdf: vi.fn().mockResolvedValue(undefined)
}));

describe('PdfManager', () => {
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
        pdf_path TEXT,
        download_status TEXT,
        downloaded_at DATETIME,
        fulltext TEXT
      );
      CREATE TABLE external_pdfs (
        id TEXT PRIMARY KEY,
        title TEXT,
        authors TEXT,
        year INTEGER,
        source TEXT,
        pdf_path TEXT,
        fulltext TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  describe('listPdfs', () => {
    it('should return empty list when no PDFs are downloaded', () => {
      const results = listPdfs(db);
      expect(results).toHaveLength(0);
    });

    it('should return article and external PDFs combined', () => {
      db.prepare(`
        INSERT INTO articles (id, title, authors, pub_year, journal, pdf_path, download_status, downloaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('NODE1', 'Article Title', 'Author A', 2023, 'Journal J', '/path/1.pdf', 'downloaded', '2023-01-01 10:00:00');

      db.prepare(`
        INSERT INTO external_pdfs (id, title, authors, year, pdf_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('EXT1', 'External Title', 'Author B', 2022, '/path/ext1.pdf', '2023-01-02 10:00:00');

      const results = listPdfs(db);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('external:EXT1');
      expect(results[1].id).toBe('article:NODE1');
      expect(results[0].source).toBe('external');
      expect(results[1].source).toBe('dbpia');
    });

    it('should filter by year', () => {
      db.prepare(`INSERT INTO articles (id, title, pub_year, download_status, pdf_path, downloaded_at) VALUES ('A1', 'T1', 2020, 'downloaded', 'p1', '2020-01-01')`).run();
      db.prepare(`INSERT INTO articles (id, title, pub_year, download_status, pdf_path, downloaded_at) VALUES ('A2', 'T2', 2021, 'downloaded', 'p2', '2021-01-01')`).run();

      const results = listPdfs(db, { year: 2020 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('article:A1');
    });

    it('should filter by title (case-insensitive substring)', () => {
      db.prepare(`INSERT INTO articles (id, title, download_status, pdf_path, downloaded_at) VALUES ('A1', 'Hello World', 'downloaded', 'p1', '2020-01-01')`).run();
      db.prepare(`INSERT INTO articles (id, title, download_status, pdf_path, downloaded_at) VALUES ('A2', 'Goodbye', 'downloaded', 'p2', '2021-01-01')`).run();

      const results = listPdfs(db, { title: 'hello' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Hello World');
    });

    it('should filter by journal', () => {
      db.prepare(`INSERT INTO articles (id, title, journal, download_status, pdf_path, downloaded_at) VALUES ('A1', 'T1', 'Science', 'downloaded', 'p1', '2020-01-01')`).run();
      db.prepare(`INSERT INTO articles (id, title, journal, download_status, pdf_path, downloaded_at) VALUES ('A2', 'T2', 'Nature', 'downloaded', 'p2', '2021-01-01')`).run();

      const results = listPdfs(db, { journal: 'sci' });
      expect(results).toHaveLength(1);
      expect(results[0].journal).toBe('Science');
    });
  });

  describe('getPdfInfo', () => {
    it('should return article PDF info', () => {
      db.prepare(`
        INSERT INTO articles (id, title, fulltext, download_status, pdf_path)
        VALUES ('A1', 'Title', 'Fulltext content', 'downloaded', '/path/a1.pdf')
      `).run();

      const info = getPdfInfo(db, 'article:A1');
      expect(info).not.toBeNull();
      expect(info?.title).toBe('Title');
      expect(info?.fulltext).toBe('Fulltext content');
      expect(info?.source).toBe('dbpia');
    });

    it('should return external PDF info', () => {
      db.prepare(`
        INSERT INTO external_pdfs (id, title, fulltext, pdf_path)
        VALUES ('E1', 'Ext Title', 'Ext fulltext', '/path/e1.pdf')
      `).run();

      const info = getPdfInfo(db, 'external:E1');
      expect(info).not.toBeNull();
      expect(info?.title).toBe('Ext Title');
      expect(info?.fulltext).toBe('Ext fulltext');
      expect(info?.source).toBe('external');
    });

    it('should return null for non-existent ID', () => {
      expect(getPdfInfo(db, 'article:GHOST')).toBeNull();
      expect(getPdfInfo(db, 'external:GHOST')).toBeNull();
      expect(getPdfInfo(db, 'invalid:ID')).toBeNull();
    });
  });

  describe('openPdfById', () => {
    it('should call openPdf with correct path', async () => {
      db.prepare(`
        INSERT INTO articles (id, pdf_path, download_status)
        VALUES ('A1', '/path/to/my.pdf', 'downloaded')
      `).run();

      const result = await openPdfById(db, 'article:A1');
      expect(result.success).toBe(true);
      expect(fileOps.openPdf).toHaveBeenCalledWith('/path/to/my.pdf');
    });

    it('should return failure if PDF info not found', async () => {
      const result = await openPdfById(db, 'article:GHOST');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('deletePdf', () => {
    it('should delete article PDF and reset its record', async () => {
      db.prepare(`
        INSERT INTO articles (id, pdf_path, download_status, downloaded_at)
        VALUES ('A1', '/path/a1.pdf', 'downloaded', '2023-01-01')
      `).run();

      const result = await deletePdf(db, 'article:A1');
      expect(result.success).toBe(true);
      expect(fileOps.deletePdf).toHaveBeenCalledWith('/path/a1.pdf');

      const info = db.prepare('SELECT pdf_path, download_status, downloaded_at FROM articles WHERE id = ?').get('A1') as any;
      expect(info.pdf_path).toBeNull();
      expect(info.download_status).toBe('pending');
      expect(info.downloaded_at).toBeNull();
    });

    it('should delete external PDF and its row', async () => {
      db.prepare(`
        INSERT INTO external_pdfs (id, pdf_path, title)
        VALUES ('E1', '/path/e1.pdf', 'Title')
      `).run();

      const result = await deletePdf(db, 'external:E1');
      expect(result.success).toBe(true);
      expect(fileOps.deletePdf).toHaveBeenCalledWith('/path/e1.pdf');

      const row = db.prepare('SELECT * FROM external_pdfs WHERE id = ?').get('E1');
      expect(row).toBeUndefined();
    });
  });

  describe('registerExternalPdf', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should link existing PDF to an article', async () => {
      const pdfPath = path.join(tempDir, 'test.pdf');
      await fs.writeFile(pdfPath, 'dummy pdf content');

      db.prepare("INSERT INTO articles (id, title) VALUES ('A1', 'Title')").run();

      const result = await registerExternalPdf(db, {
        pdfPath,
        articleId: 'A1'
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe('article:A1');

      const info = db.prepare('SELECT pdf_path, download_status FROM articles WHERE id = ?').get('A1') as any;
      expect(info.pdf_path).toBe(pdfPath);
      expect(info.download_status).toBe('downloaded');
    });

    it('should register standalone external PDF', async () => {
      const pdfPath = path.join(tempDir, 'ext.pdf');
      await fs.writeFile(pdfPath, 'dummy content');

      const result = await registerExternalPdf(db, {
        pdfPath,
        title: 'External PDF',
        authors: 'Author E',
        year: 2024
      });

      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^external:/);

      const extId = result.id?.replace('external:', '');
      const row = db.prepare('SELECT * FROM external_pdfs WHERE id = ?').get(extId) as any;
      expect(row.title).toBe('External PDF');
      expect(row.pdf_path).toBe(pdfPath);
    });

    it('should return error if PDF file does not exist', async () => {
      const result = await registerExternalPdf(db, {
        pdfPath: '/non/existent/path.pdf'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });
});
