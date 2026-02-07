import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { openDb, migrate } from '../../db/index.js';
import { saveSession, AuthType } from '../../auth/sessionStore.js';
import { buildDownloadLink } from '../link.js';

describe('buildDownloadLink', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dbpia-link-test-'));
    db = openDb({ dbDir: tempDir });
    migrate(db);

    db.prepare(
      `INSERT INTO articles (id, title, authors, raw_json)
       VALUES (?, ?, ?, ?)`
    ).run(
      'local-article-1',
      '테스트 논문',
      '홍길동',
      JSON.stringify({
        id: 'NODE12345678',
        link_url: 'https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE12345678'
      })
    );
  });

  afterEach(async () => {
    db.close();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('returns not_authenticated when no valid session exists', async () => {
    const result = await buildDownloadLink(db, 'local-article-1');

    expect(result.success).toBe(false);
    expect(result.message).toContain('No authenticated DBpia session');
  });

  it('parses download URL from detail and downloadData responses', async () => {
    saveSession(db, {
      authType: AuthType.INSTITUTION,
      cookiesJson: JSON.stringify([
        { name: 'SESSION', value: 'abc', domain: '.dbpia.co.kr', path: '/' }
      ]),
      institutionName: '테스트기관',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/journal/articleDetail')) {
        return new Response(
          '<input name="depth" value="Article" /><input name="shape" value="download" /><input name="systemCode" value="147003" />',
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ link: 'https://download.example/file.pdf' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const result = await buildDownloadLink(db, 'local-article-1', { fetchFn: fetchMock as typeof fetch });

    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('https://download.example/file.pdf');
    expect(result.nodeId).toBe('NODE12345678');
    expect(result.payload?.systemCode).toBe('147003');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns failure when downloadData has no link', async () => {
    saveSession(db, {
      authType: AuthType.INSTITUTION,
      cookiesJson: JSON.stringify([
        { name: 'SESSION', value: 'abc', domain: '.dbpia.co.kr', path: '/' }
      ]),
      institutionName: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/journal/articleDetail')) {
        return new Response('<html></html>', { status: 200 });
      }
      return new Response(JSON.stringify({ resultCode: 'N' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const result = await buildDownloadLink(db, 'local-article-1', { fetchFn: fetchMock as typeof fetch });

    expect(result.success).toBe(false);
    expect(result.message).toContain('did not include a download link');
  });

  it('returns manual guidance for non-institution session', async () => {
    saveSession(db, {
      authType: AuthType.PERSONAL,
      cookiesJson: JSON.stringify([
        { name: 'SESSION', value: 'abc', domain: '.dbpia.co.kr', path: '/' }
      ]),
      institutionName: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const result = await buildDownloadLink(db, 'local-article-1');

    expect(result.success).toBe(false);
    expect(result.nextAction).toBe('open_detail');
    expect(result.detailUrl).toContain('nodeId=NODE12345678');
    expect(result.message).toContain('only available for authorized institution sessions');
  });
});
