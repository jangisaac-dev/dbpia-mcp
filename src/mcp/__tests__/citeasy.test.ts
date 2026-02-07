import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { openDb, migrate } from '../../db/index.js';
import { handleCiteasy } from '../tools.js';

interface CiteasyResponse {
  content: Array<{ type: string; text: string }>;
  structuredContent: {
    success: boolean;
    articleId: string;
    downloadStatus: string;
    download: { status: string } | null;
    pdf: { pdfPath: string } | null;
    citation: { citation: string; style: string };
  };
}

describe('handleCiteasy', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dbpia-citeasy-'));
    db = openDb({ dbDir: tempDir });
    migrate(db);

    db.prepare(
      `INSERT INTO articles (id, title, authors, journal, pub_year, raw_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      'NODE-CITE-1',
      '테스트 인용 논문',
      '["홍길동", "김철수"]',
      '테스트저널',
      2024,
      JSON.stringify({ title: '테스트 인용 논문', journal: '테스트저널', doi: '10.1234/test' })
    );
  });

  afterEach(async () => {
    db.close();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('returns not found when article is missing', async () => {
    const result = await handleCiteasy(db, { articleId: 'NODE-NOT-FOUND' });
    const payload = result.structuredContent as { success: boolean; message: string };

    expect(payload.success).toBe(false);
    expect(payload.message).toBe('Article not found');
  });

  it('runs download+citation pipeline and includes pdf info', async () => {
    const downloadMock = vi.fn(async (innerDb: Database.Database, articleId: string, options: { autoLogin?: boolean }) => {
      const pdfPath = path.join(tempDir, 'NODE-CITE-1.pdf');
      await fsp.writeFile(pdfPath, 'pdf', 'utf-8');
      innerDb
        .prepare("UPDATE articles SET pdf_path = ?, download_status = 'downloaded', downloaded_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(pdfPath, articleId);

      return {
        success: true,
        articleId,
        status: 'downloaded' as const,
        message: 'Downloaded',
        pdfPath,
        optionsUsed: options,
      };
    });

    const result = await handleCiteasy(
      db,
      { articleId: 'NODE-CITE-1', style: 'apa' },
      { download: downloadMock as never }
    );

    const payload = result as CiteasyResponse;

    expect(downloadMock).toHaveBeenCalledTimes(1);
    const calledOptions = downloadMock.mock.calls[0][2] as { autoLogin?: boolean };
    expect(calledOptions.autoLogin).toBe(false);

    expect(payload.structuredContent.success).toBe(true);
    expect(payload.structuredContent.articleId).toBe('NODE-CITE-1');
    expect(payload.structuredContent.downloadStatus).toBe('downloaded');
    expect(payload.structuredContent.pdf?.pdfPath).toContain('NODE-CITE-1.pdf');
    expect(payload.structuredContent.citation.style).toBe('apa');
    expect(payload.content[0].text.length).toBeGreaterThan(5);
  });

  it('can generate citation without download', async () => {
    const downloadMock = vi.fn();

    const result = await handleCiteasy(
      db,
      { articleId: 'NODE-CITE-1', download: false, style: 'chicago' },
      { download: downloadMock as never }
    );

    const payload = result as CiteasyResponse;
    expect(downloadMock).not.toHaveBeenCalled();
    expect(payload.structuredContent.success).toBe(true);
    expect(payload.structuredContent.downloadStatus).toBe('skipped');
    expect(payload.structuredContent.citation.style).toBe('chicago');
  });
});
