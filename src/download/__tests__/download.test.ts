import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDb, migrate } from '../../db/index.js';
import { downloadPdf } from '../download.js';
import { AuthType, saveSession } from '../../auth/sessionStore.js';
import { DownloadStatus } from '../checkDownload.js';
import type Database from 'better-sqlite3';

interface FakeDownload {
  saveAs: ReturnType<typeof vi.fn>;
}

interface FakePage {
  goto: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  waitForEvent: ReturnType<typeof vi.fn>;
}

interface FakeContext {
  newPage: ReturnType<typeof vi.fn>;
}

interface FakeManager {
  createContext(options?: unknown): Promise<FakeContext>;
  close(): Promise<void>;
  createContextSpy: ReturnType<typeof vi.fn>;
  closeSpy: ReturnType<typeof vi.fn>;
}

describe('downloadPdf', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dbpia-download-test-'));
    db = openDb({ dbDir: tempDir });
    migrate(db);

    db.prepare(
      `INSERT INTO articles (id, title, authors, pub_year, journal)
       VALUES (?, ?, ?, ?, ?)`
    ).run('NODE-1', '테스트 논문', '홍길동', 2024, '테스트학회');
  });

  afterEach(async () => {
    db.close();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  function createFakePlaywright(downloadImpl?: (filePath: string) => Promise<void>): {
    manager: FakeManager;
    page: FakePage;
  } {
    const fakeDownload: FakeDownload = {
      saveAs: vi.fn(async (filePath: string) => {
        if (downloadImpl) {
          await downloadImpl(filePath);
          return;
        }
        await fsp.writeFile(filePath, 'fake pdf', 'utf-8');
      })
    };

    const page: FakePage = {
      goto: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      waitForEvent: vi.fn(async () => fakeDownload)
    };

    const context: FakeContext = {
      newPage: vi.fn(async () => page)
    };

    const createContextSpy = vi.fn(async () => context);
    const closeSpy = vi.fn(async () => undefined);
    const manager: FakeManager = {
      createContext: async (options?: unknown) => {
        void options;
        return createContextSpy();
      },
      close: async () => closeSpy(),
      createContextSpy,
      closeSpy
    };

    return { manager, page };
  }

  it('returns not_authenticated without session', async () => {
    const { manager } = createFakePlaywright();

    const result = await downloadPdf(db, 'NODE-1', {
      autoLogin: false,
      manager: manager as never,
      checkAvailability: vi.fn(async () => ({ status: DownloadStatus.FREE })) as never
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('not_authenticated');
    expect(manager.createContextSpy).not.toHaveBeenCalled();
  });

  it('returns not_authenticated even when autoLogin=true and session missing', async () => {
    const { manager } = createFakePlaywright();

    const result = await downloadPdf(db, 'NODE-1', {
      autoLogin: true,
      manager: manager as never,
      checkAvailability: vi.fn(async () => ({ status: DownloadStatus.FREE })) as never
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('not_authenticated');
    expect(manager.createContextSpy).not.toHaveBeenCalled();
  });

  it('downloads PDF automatically for institution + free', async () => {
    saveSession(db, {
      authType: AuthType.INSTITUTION,
      cookiesJson: '[]',
      institutionName: 'Test University',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    });

    const { manager, page } = createFakePlaywright();
    const targetPdf = path.join(tempDir, 'output', 'NODE-1.pdf');

    const result = await downloadPdf(db, 'NODE-1', {
      manager: manager as never,
      checkAvailability: vi.fn(async () => ({ status: DownloadStatus.FREE })) as never,
      buildTargetPath: vi.fn(() => targetPdf),
      movePdfFile: vi.fn(async (src: string, dest: string) => {
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(src, dest);
      }) as never
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('downloaded');
    expect(result.pdfPath).toBe(targetPdf);
    expect(page.waitForEvent).toHaveBeenCalledWith('download', { timeout: 120000 });

    const row = db
      .prepare("SELECT download_status, pdf_path FROM articles WHERE id = 'NODE-1'")
      .get() as { download_status: string; pdf_path: string };

    expect(row.download_status).toBe('downloaded');
    expect(row.pdf_path).toBe(targetPdf);
  });

  it('returns manual_required for paid download', async () => {
    saveSession(db, {
      authType: AuthType.INSTITUTION,
      cookiesJson: '[]',
      institutionName: 'Test University',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    });

    const { manager } = createFakePlaywright();
    const openSpy = vi.fn(async () => ({ success: true, message: 'opened' }));

    const result = await downloadPdf(db, 'NODE-1', {
      manager: manager as never,
      checkAvailability: vi.fn(async () => ({ status: DownloadStatus.PAID })) as never,
      openArticleInBrowser: openSpy as never
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('manual_required');
    expect(openSpy).toHaveBeenCalled();
  });

  it('returns unavailable when download is blocked', async () => {
    saveSession(db, {
      authType: AuthType.INSTITUTION,
      cookiesJson: '[]',
      institutionName: 'Test University',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    });

    const { manager } = createFakePlaywright();

    const result = await downloadPdf(db, 'NODE-1', {
      manager: manager as never,
      checkAvailability: vi.fn(async () => ({
        status: DownloadStatus.UNAVAILABLE,
        message: '권한 없음'
      })) as never
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('unavailable');
    expect(result.message).toContain('권한 없음');
  });

  it('returns already_downloaded when existing file exists and overwrite=false', async () => {
    const existingPdf = path.join(tempDir, 'already.pdf');
    await fsp.writeFile(existingPdf, 'already downloaded', 'utf-8');
    db.prepare("UPDATE articles SET pdf_path = ? WHERE id = 'NODE-1'").run(existingPdf);

    saveSession(db, {
      authType: AuthType.INSTITUTION,
      cookiesJson: '[]',
      institutionName: 'Test University',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    });

    const { manager } = createFakePlaywright();

    const result = await downloadPdf(db, 'NODE-1', {
      manager: manager as never,
      checkAvailability: vi.fn(async () => ({ status: DownloadStatus.FREE })) as never
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('already_downloaded');
    expect(manager.createContextSpy).not.toHaveBeenCalled();
  });

  it('returns error when file move fails during download', async () => {
    saveSession(db, {
      authType: AuthType.INSTITUTION,
      cookiesJson: '[]',
      institutionName: 'Test University',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    });

    const { manager } = createFakePlaywright();

    const result = await downloadPdf(db, 'NODE-1', {
      manager: manager as never,
      checkAvailability: vi.fn(async () => ({ status: DownloadStatus.FREE })) as never,
      movePdfFile: vi.fn(async () => {
        throw new Error('move failed');
      }) as never,
      buildTargetPath: vi.fn(() => path.join(tempDir, 'fail.pdf'))
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('error');
  });
});
