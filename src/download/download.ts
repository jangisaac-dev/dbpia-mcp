import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type Database from 'better-sqlite3';
import type { Cookie, Page } from 'playwright';
import { PlaywrightManager, type PlaywrightOptions } from '../browser/playwright.js';
import { openInBrowser, getArticleUrl } from '../browser/open.js';
import { getArticleNodeId, resolveArticleByAnyId } from '../db/articles.js';
import { getSessionStatus } from '../auth/login.js';
import { AuthType, loadLatestValidSession } from '../auth/sessionStore.js';
import { buildPdfPath } from '../pdf/pathUtils.js';
import { movePdf } from '../pdf/fileOps.js';
import {
  checkDownloadAvailability,
  DownloadStatus,
  SELECTORS,
  resolveDownloadButtonSelector
} from './checkDownload.js';

export interface DownloadResult {
  success: boolean;
  articleId: string;
  status: 'downloaded' | 'manual_required' | 'unavailable' | 'not_authenticated' | 'already_downloaded' | 'error';
  message: string;
  pdfPath?: string;
  resolvedArticleId?: string;
  nodeId?: string;
}

interface PageLike {
  goto(url: string): Promise<unknown>;
  click(selector: string): Promise<void>;
  waitForEvent(event: 'download', options?: { timeout?: number }): Promise<DownloadLike>;
}

interface DownloadLike {
  saveAs(filePath: string): Promise<void>;
}

interface ContextLike {
  newPage(): Promise<PageLike>;
  addCookies?(cookies: Cookie[]): Promise<void>;
}

interface PlaywrightManagerLike {
  createContext(options?: PlaywrightOptions): Promise<ContextLike>;
  close(): Promise<void>;
}

interface DownloadAvailabilityLike {
  status: DownloadStatus;
  message?: string;
}

function defaultCheckAvailability(page: PageLike, articleIdOrUrl: string): Promise<DownloadAvailabilityLike> {
  return checkDownloadAvailability(page as unknown as Page, articleIdOrUrl);
}

export interface DownloadOptions {
  overwrite?: boolean;
  timeoutMs?: number;
  autoLogin?: boolean;
  contextOptions?: PlaywrightOptions;
  manager?: PlaywrightManagerLike;
  checkAvailability?: (page: PageLike, articleIdOrUrl: string) => Promise<DownloadAvailabilityLike>;
  movePdfFile?: typeof movePdf;
  buildTargetPath?: typeof buildPdfPath;
  openArticleInBrowser?: typeof openInBrowser;
  fileExists?: (filePath: string) => Promise<boolean>;
}

const DEFAULT_TIMEOUT_MS = 120_000;

async function defaultFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseSessionCookies(cookiesJson: string | null | undefined): Cookie[] {
  if (!cookiesJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(cookiesJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((cookie): cookie is Cookie => {
      if (!cookie || typeof cookie !== 'object') {
        return false;
      }

      const typed = cookie as Partial<Cookie>;
      return (
        typeof typed.name === 'string' &&
        typeof typed.value === 'string' &&
        typeof typed.domain === 'string' &&
        typeof typed.path === 'string'
      );
    });
  } catch {
    return [];
  }
}

export async function downloadPdf(
  db: Database.Database,
  articleIdOrNodeId: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const article = resolveArticleByAnyId(db, articleIdOrNodeId);
  if (!article) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      status: 'error',
      message: `Article ${articleIdOrNodeId} not found in local database.`
    };
  }

  const resolvedArticleId = article.id;
  const nodeId = getArticleNodeId(article);

  const exists = options.fileExists ?? defaultFileExists;
  if (!options.overwrite && article.pdf_path && await exists(article.pdf_path)) {
    return {
      success: true,
      articleId: articleIdOrNodeId,
      status: 'already_downloaded',
      message: `PDF already exists for ${resolvedArticleId}.`,
      pdfPath: article.pdf_path,
      resolvedArticleId,
      nodeId
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const autoLogin = options.autoLogin ?? false;
  const checkAvailability = options.checkAvailability ?? defaultCheckAvailability;
  const movePdfFile = options.movePdfFile ?? movePdf;
  const buildTargetPath = options.buildTargetPath ?? buildPdfPath;
  const openArticleInBrowser = options.openArticleInBrowser ?? openInBrowser;
  const manager = options.manager ?? new PlaywrightManager();
  const ownManager = !options.manager;
  const articleUrl = getArticleUrl(nodeId);
  const session = getSessionStatus(db);

  try {
    if (!session.authenticated) {
      const modeMessage = autoLogin
        ? 'DBpia site-side auto-login session was not available. Please log in first.'
        : 'No active authenticated session. Please log in first.';

      return {
        success: false,
        articleId: articleIdOrNodeId,
        status: 'not_authenticated',
        message: modeMessage,
        resolvedArticleId,
        nodeId
      };
    }

    const persistedSession = loadLatestValidSession(db);
    const persistedCookies = parseSessionCookies(persistedSession?.cookiesJson);

    const context = await manager.createContext(options.contextOptions);
    if (persistedCookies.length > 0 && typeof context.addCookies === 'function') {
      await context.addCookies(persistedCookies);
    }

    const page = await context.newPage();
    await page.goto(articleUrl);

    const availability = await checkAvailability(page, nodeId);
    if (availability.status === DownloadStatus.UNAVAILABLE) {
      db.prepare("UPDATE articles SET download_status = 'unavailable' WHERE id = ?").run(resolvedArticleId);
      return {
        success: false,
        articleId: articleIdOrNodeId,
        status: 'unavailable',
        message: availability.message || 'Download is unavailable for this article.',
        resolvedArticleId,
        nodeId
      };
    }

    const shouldManual = availability.status === DownloadStatus.PAID || session.authType !== AuthType.INSTITUTION;
    if (shouldManual) {
      const openResult = await openArticleInBrowser(articleUrl);
      return {
        success: false,
        articleId: articleIdOrNodeId,
        status: 'manual_required',
        message: `Manual download required. ${openResult.message}`,
        resolvedArticleId,
        nodeId
      };
    }

    const tmpPath = path.join(os.tmpdir(), `dbpia-download-${resolvedArticleId}-${randomUUID()}.pdf`);
    let downloadSelector = SELECTORS.DOWNLOAD_BUTTON;
    try {
      const maybeRealPage = page as unknown as { $$?: unknown };
      if (typeof maybeRealPage.$$ === 'function') {
        const resolvedSelector = await resolveDownloadButtonSelector(page as unknown as Page);
        if (resolvedSelector) {
          downloadSelector = resolvedSelector;
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        articleId: articleIdOrNodeId,
        status: 'error',
        message: `Failed to resolve download selector: ${reason}`,
        resolvedArticleId,
        nodeId
      };
    }

    const download = await Promise.all([
      page.waitForEvent('download', { timeout: timeoutMs }),
      page.click(downloadSelector)
    ]).then(([dl]) => dl);

    await download.saveAs(tmpPath);

    const targetPath = buildTargetPath(
      String(article.pub_year ?? new Date().getFullYear()),
      article.journal || 'Unknown Journal',
      nodeId
    );

    await movePdfFile(tmpPath, targetPath);

    db.prepare(
      "UPDATE articles SET pdf_path = ?, download_status = 'downloaded', downloaded_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(targetPath, resolvedArticleId);

    return {
      success: true,
      articleId: articleIdOrNodeId,
      status: 'downloaded',
      message: `Downloaded PDF for ${resolvedArticleId}`,
      pdfPath: targetPath,
      resolvedArticleId,
      nodeId
    };
  } catch (error) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      resolvedArticleId,
      nodeId
    };
  } finally {
    if (ownManager) {
      await manager.close();
    }
  }
}
