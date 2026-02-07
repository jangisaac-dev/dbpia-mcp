import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaywrightManager } from '../../browser/playwright.js';
import { checkDownloadAvailability, DownloadStatus } from '../checkDownload.js';
import { Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('checkDownloadAvailability', () => {
  let manager: PlaywrightManager;
  let context: BrowserContext;
  let page: Page;

  beforeEach(async () => {
    manager = new PlaywrightManager();
    context = await manager.createContext({ headless: true });
    page = await context.newPage();
  });

  afterEach(async () => {
    await manager.close();
  });

  const loadFixture = async (fileName: string) => {
    const filePath = path.join(__dirname, '..', 'fixtures', fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    await page.setContent(content);
  };

  it('should detect free download availability', async () => {
    await loadFixture('free.html');
    const result = await checkDownloadAvailability(page, 'NODE00000001');
    expect(result.status).toBe(DownloadStatus.FREE);
  });

  it('should detect paid download availability with price', async () => {
    await loadFixture('paid.html');
    const result = await checkDownloadAvailability(page, 'NODE00000002');
    expect(result.status).toBe(DownloadStatus.PAID);
    expect(result.price).toBe('6,000원');
  });

  it('should detect unavailable download', async () => {
    await loadFixture('unavailable.html');
    const result = await checkDownloadAvailability(page, 'NODE00000003');
    expect(result.status).toBe(DownloadStatus.UNAVAILABLE);
    expect(result.message).toContain('다운로드 불가');
  });

  it('should return unknown for empty page', async () => {
    await page.setContent('<html><body></body></html>');
    const result = await checkDownloadAvailability(page, 'NODE00000004');
    expect(result.status).toBe(DownloadStatus.UNKNOWN);
  });
});
