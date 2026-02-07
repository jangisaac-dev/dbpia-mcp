import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, migrate } from '../../db/index.js';
import { AuthType, saveSession } from '../sessionStore.js';
import {
  detectAuthStatusFromIndicators,
  detectInstitutionName,
  getSessionStatus,
  login,
  logout,
  type PlaywrightSessionManager,
} from '../login.js';

type EvaluateFn<R> = () => R;

class MockPage {
  public readonly gotoCalls: string[] = [];
  public waitCalls = 0;
  private evaluateIndex = 0;

  constructor(private readonly pageTexts: string[]) {}

  async goto(url: string): Promise<void> {
    this.gotoCalls.push(url);
  }

  async evaluate<R>(_fn: EvaluateFn<R>): Promise<R> {
    const index = Math.min(this.evaluateIndex, this.pageTexts.length - 1);
    this.evaluateIndex += 1;
    return this.pageTexts[index] as unknown as R;
  }

  async waitForTimeout(_timeout: number): Promise<void> {
    this.waitCalls += 1;
  }
}

class MockContext {
  constructor(
    private readonly page: MockPage,
    private readonly cookieStates: Array<{ name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Lax' | 'Strict' | 'None' }[]>
  ) {}

  async newPage(): Promise<MockPage> {
    return this.page;
  }

  async cookies(): Promise<{ name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Lax' | 'Strict' | 'None' }[]> {
    if (this.cookieStates.length === 0) {
      return [];
    }

    if (this.cookieStates.length === 1) {
      return this.cookieStates[0];
    }

    const next = this.cookieStates.shift();
    return next ?? [];
  }
}

class MockManager implements PlaywrightSessionManager {
  public closed = false;
  constructor(private readonly context: MockContext) {}

  async createContext(): Promise<MockContext> {
    return this.context;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

function authCookie(expiresAtSeconds: number) {
  return [
    {
      name: 'JSESSIONID',
      value: 'session-cookie',
      domain: '.dbpia.co.kr',
      path: '/',
      expires: expiresAtSeconds,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
    },
  ];
}

describe('auth login module', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbpia-login-test-'));
    db = openDb({ dbDir: tempDir });
    migrate(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('detectInstitutionName', () => {
    it('extracts institution from indicator text', () => {
      const text = 'DBpia 이용기관: 테스트대학교\n로그아웃';
      expect(detectInstitutionName(text)).toBe('테스트대학교');
    });

    it('returns null when no institution marker exists', () => {
      expect(detectInstitutionName('로그인 후 이용 가능합니다.')).toBeNull();
    });
  });

  describe('detectAuthStatusFromIndicators', () => {
    it('detects institution authentication and derives expiry', () => {
      const expiresSeconds = 2_000_000_000;
      const status = detectAuthStatusFromIndicators(
        '이용기관: 테스트대학교 기관인증 완료',
        authCookie(expiresSeconds)
      );

      expect(status.authenticated).toBe(true);
      expect(status.authType).toBe(AuthType.INSTITUTION);
      expect(status.institutionName).toBe('테스트대학교');
      expect(status.expiresAt).toBe(new Date(expiresSeconds * 1000).toISOString());
    });

    it('detects personal authentication from logout indicator', () => {
      const status = detectAuthStatusFromIndicators('마이dbpia | 로그아웃', []);
      expect(status.authenticated).toBe(true);
      expect(status.authType).toBe(AuthType.PERSONAL);
      expect(status.institutionName).toBeNull();
    });

    it('returns unknown when no indicators found', () => {
      const status = detectAuthStatusFromIndicators('환영합니다. 로그인 해주세요.', []);
      expect(status.authenticated).toBe(false);
      expect(status.authType).toBe(AuthType.UNKNOWN);
      expect(status.expiresAt).toBeNull();
    });
  });

  describe('login', () => {
    it('waits for manual login and persists institution session', async () => {
      const page = new MockPage([
        '로그인이 필요합니다.',
        '소속기관: 테스트대학교\n기관인증 완료\n로그아웃',
      ]);
      const manager = new MockManager(
        new MockContext(page, [[], authCookie(2_100_000_000)])
      );

      const result = await login(db, {
        manager,
        loginUrl: 'https://www.dbpia.co.kr/login',
        timeoutMs: 100,
        pollIntervalMs: 1,
      });

      expect(page.gotoCalls).toEqual(['https://www.dbpia.co.kr/login']);
      expect(page.waitCalls).toBe(1);
      expect(manager.closed).toBe(false);
      expect(result.authenticated).toBe(true);
      expect(result.authType).toBe(AuthType.INSTITUTION);
      expect(result.institutionName).toBe('테스트대학교');

      const status = getSessionStatus(db);
      expect(status.authenticated).toBe(true);
      expect(status.authType).toBe(AuthType.INSTITUTION);
      expect(status.institutionName).toBe('테스트대학교');
    });

    it('throws timeout error when login does not complete', async () => {
      const page = new MockPage(['로그인 필요', '로그인 필요', '로그인 필요']);
      const manager = new MockManager(new MockContext(page, [[], [], []]));

      await expect(
        login(db, {
          manager,
          timeoutMs: 5,
          pollIntervalMs: 1,
        })
      ).rejects.toThrow('Manual login timed out');

      expect(getSessionStatus(db).authenticated).toBe(false);
    });
  });

  describe('logout and getSessionStatus', () => {
    it('clears saved sessions on logout', () => {
      saveSession(db, {
        id: 'existing',
        cookiesJson: JSON.stringify(authCookie(2_200_000_000)),
        authType: AuthType.PERSONAL,
        institutionName: null,
        expiresAt: new Date(2_200_000_000 * 1000).toISOString(),
      });

      expect(getSessionStatus(db).authenticated).toBe(true);
      logout(db);
      expect(getSessionStatus(db).authenticated).toBe(false);
      expect(getSessionStatus(db).authType).toBe(AuthType.UNKNOWN);
    });

    it('returns unauthenticated for expired session', () => {
      saveSession(db, {
        id: 'expired',
        cookiesJson: '[]',
        authType: AuthType.PERSONAL,
        expiresAt: '2020-01-01T00:00:00.000Z',
      });

      const status = getSessionStatus(db, new Date('2021-01-01T00:00:00.000Z'));
      expect(status.authenticated).toBe(false);
      expect(status.authType).toBe(AuthType.UNKNOWN);
    });
  });
});
