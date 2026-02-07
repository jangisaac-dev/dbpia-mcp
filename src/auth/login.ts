import { Database } from 'better-sqlite3';
import { type BrowserContext, type Cookie } from 'playwright';
import { PlaywrightManager, type PlaywrightOptions } from '../browser/playwright.js';
import { AuthType, clearSessions, loadLatestValidSession, saveSession } from './sessionStore.js';

export interface SessionStatus {
  authenticated: boolean;
  authType: AuthType;
  institutionName: string | null;
  expiresAt: string | null;
}

export interface RemoteSessionStatus extends SessionStatus {
  myInfo: Record<string, unknown> | null;
}

export interface CredentialLoginOptions {
  userId?: string;
  userPw?: string;
  autoLogin?: 'Y' | 'N';
  idSave?: 'Y' | 'N';
  fetchFn?: typeof fetch;
}

export interface SessionStatusOptions {
  fetchFn?: typeof fetch;
}

export interface LoginOptions {
  manager?: PlaywrightSessionManager;
  loginUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  contextOptions?: PlaywrightOptions;
}

interface PageLike {
  goto(url: string): Promise<unknown>;
  evaluate<R>(fn: () => R): Promise<R>;
  waitForTimeout(timeout: number): Promise<void>;
}

interface ContextLike {
  newPage(): Promise<PageLike>;
  cookies(urls?: string | string[]): Promise<Cookie[]>;
}

export interface PlaywrightSessionManager {
  createContext(options?: PlaywrightOptions): Promise<BrowserContext | ContextLike>;
  close(): Promise<void>;
}

const DEFAULT_LOGIN_URL = 'https://www.dbpia.co.kr';
const DEFAULT_LOGIN_POST_URL = 'https://www.dbpia.co.kr/member/b2cLoginProc';
const DEFAULT_ME_URL = 'https://www.dbpia.co.kr/member/me';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

const PERSONAL_AUTH_MARKERS = ['로그아웃', 'my dbpia', '마이dbpia', '내 서재', '회원정보'];
const INSTITUTION_AUTH_MARKERS = ['기관인증', '소속기관', '이용기관', 'ip인증'];
const AUTH_COOKIE_PATTERNS = [/^JSESSIONID$/i, /dbpia/i, /session/i, /auth/i];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function resolveCredential(value?: string, envNames: string[] = []): string | undefined {
  if (value && value.trim().length > 0) {
    return value.trim();
  }

  for (const envName of envNames) {
    const envValue = process.env[envName];
    if (envValue && envValue.trim().length > 0) {
      return envValue.trim();
    }
  }

  return undefined;
}

function splitSetCookieHeader(setCookieHeader: string): string[] {
  return setCookieHeader.split(/,(?=[^;\s]+=)/g).map((value) => value.trim()).filter(Boolean);
}

function getSetCookieValues(headers: Headers): string[] {
  const maybeHeaders = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof maybeHeaders.getSetCookie === 'function') {
    return maybeHeaders.getSetCookie();
  }

  const singleHeader = headers.get('set-cookie');
  if (!singleHeader) {
    return [];
  }

  return splitSetCookieHeader(singleHeader);
}

function parseSetCookieLines(setCookieLines: string[]): Cookie[] {
  const parsed: Cookie[] = [];

  for (const line of setCookieLines) {
    const parts = line.split(';').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    const [nameValue, ...attrs] = parts;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1).trim();

    let domain = '.dbpia.co.kr';
    let cookiePath = '/';
    let expires = -1;
    let httpOnly = false;
    let secure = false;
    let sameSite: 'Lax' | 'Strict' | 'None' = 'Lax';

    for (const attr of attrs) {
      const [rawKey, ...rawValueParts] = attr.split('=');
      const key = rawKey.trim().toLowerCase();
      const attrValue = rawValueParts.join('=').trim();

      if (key === 'domain' && attrValue) {
        domain = attrValue;
      } else if (key === 'path' && attrValue) {
        cookiePath = attrValue;
      } else if (key === 'expires' && attrValue) {
        const parsedDate = new Date(attrValue);
        if (!Number.isNaN(parsedDate.getTime())) {
          expires = Math.floor(parsedDate.getTime() / 1000);
        }
      } else if (key === 'max-age' && attrValue) {
        const parsedMaxAge = Number.parseInt(attrValue, 10);
        if (Number.isFinite(parsedMaxAge)) {
          expires = Math.floor(Date.now() / 1000) + parsedMaxAge;
        }
      } else if (key === 'httponly') {
        httpOnly = true;
      } else if (key === 'secure') {
        secure = true;
      } else if (key === 'samesite') {
        const normalized = attrValue.toLowerCase();
        if (normalized === 'none') sameSite = 'None';
        if (normalized === 'strict') sameSite = 'Strict';
        if (normalized === 'lax') sameSite = 'Lax';
      }
    }

    parsed.push({
      name,
      value,
      domain,
      path: cookiePath,
      expires,
      httpOnly,
      secure,
      sameSite,
    });
  }

  return parsed;
}

function cookieHeaderFromCookies(cookies: Cookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function buildStatusFromMyInfo(myInfo: Record<string, unknown> | null, fallbackExpiresAt: string | null): RemoteSessionStatus {
  const b2cId = typeof myInfo?.b2cId === 'string' ? myInfo.b2cId : null;
  const b2bName = typeof myInfo?.b2bName === 'string' ? myInfo.b2bName : null;

  const authenticated = Boolean(b2cId);
  const authType = authenticated
    ? (b2bName ? AuthType.INSTITUTION : AuthType.PERSONAL)
    : AuthType.UNKNOWN;

  return {
    authenticated,
    authType,
    institutionName: b2bName,
    expiresAt: fallbackExpiresAt,
    myInfo,
  };
}

async function fetchMyInfo(cookies: Cookie[], fetchFn: typeof fetch): Promise<Record<string, unknown> | null> {
  if (cookies.length === 0) {
    return null;
  }

  const response = await fetchFn(DEFAULT_ME_URL, {
    method: 'GET',
    headers: {
      Accept: '*/*',
      Cookie: cookieHeaderFromCookies(cookies),
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload as Record<string, unknown>;
}

export function detectInstitutionName(text: string): string | null {
  const normalized = normalizeText(text);

  const patterns = [
    /(?:기관인증|소속기관|이용기관)\s*[:：]\s*(.+?)(?=\s+(?:기관인증|ip인증|로그아웃|로그인|마이dbpia|my dbpia)\b|$)/i,
    /소속\s*[:：]\s*(.+?)(?=\s+(?:기관인증|ip인증|로그아웃|로그인|마이dbpia|my dbpia)\b|$)/i,
    /(.{2,80}?)\s*(?:기관인증|IP인증)\s*(?:중|완료|사용)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]
      ?.replace(/\s+(?:기관인증|ip인증|로그아웃|로그인|마이dbpia|my dbpia).*$/i, '')
      .replace(/[\s\-–—|]+$/, '')
      .trim();
    if (candidate && candidate.length >= 2 && !candidate.includes('로그인')) {
      return candidate;
    }
  }

  return null;
}

export function detectAuthStatusFromIndicators(pageText: string, cookies: Cookie[]): SessionStatus {
  const normalized = normalizeText(pageText);
  const lowered = normalized.toLowerCase();
  const institutionName = detectInstitutionName(normalized);

  const hasInstitutionMarker =
    INSTITUTION_AUTH_MARKERS.some((marker) => lowered.includes(marker.toLowerCase())) &&
    /(완료|접속|사용|인증됨)/i.test(normalized);
  const hasPersonalMarker = PERSONAL_AUTH_MARKERS.some((marker) => lowered.includes(marker));
  const hasAuthCookie = cookies.some((cookie) => AUTH_COOKIE_PATTERNS.some((pattern) => pattern.test(cookie.name)));

  if (institutionName || hasInstitutionMarker) {
    return {
      authenticated: true,
      authType: AuthType.INSTITUTION,
      institutionName,
      expiresAt: deriveSessionExpiresAt(cookies),
    };
  }

  if (hasPersonalMarker || hasAuthCookie) {
    return {
      authenticated: true,
      authType: AuthType.PERSONAL,
      institutionName: null,
      expiresAt: deriveSessionExpiresAt(cookies),
    };
  }

  return {
    authenticated: false,
    authType: AuthType.UNKNOWN,
    institutionName: null,
    expiresAt: null,
  };
}

function deriveSessionExpiresAt(cookies: Cookie[]): string | null {
  const expiresSeconds = cookies
    .map((cookie) => cookie.expires)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (expiresSeconds.length === 0) {
    return null;
  }

  const maxExpiresSeconds = Math.max(...expiresSeconds);
  return new Date(maxExpiresSeconds * 1_000).toISOString();
}

async function readPageText(page: PageLike): Promise<string> {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText;
    if (typeof bodyText === 'string' && bodyText.trim().length > 0) {
      return bodyText;
    }

    const rootText = document.documentElement?.innerText;
    return typeof rootText === 'string' ? rootText : '';
  });
}

export async function login(db: Database, options: LoginOptions = {}): Promise<SessionStatus> {
  const manager = options.manager ?? new PlaywrightManager();
  const ownsManager = !options.manager;
  const loginUrl = options.loginUrl ?? DEFAULT_LOGIN_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  try {
    const context = (await manager.createContext(options.contextOptions)) as ContextLike;
    const page = await context.newPage();
    await page.goto(loginUrl);

    while (Date.now() < deadline) {
      const [pageText, cookies] = await Promise.all([readPageText(page), context.cookies()]);
      const status = detectAuthStatusFromIndicators(pageText, cookies);

      if (status.authenticated) {
        saveSession(db, {
          cookiesJson: JSON.stringify(cookies),
          authType: status.authType,
          institutionName: status.institutionName,
          expiresAt: status.expiresAt,
        });
        return status;
      }

      await page.waitForTimeout(pollIntervalMs);
    }

    throw new Error(
      `Manual login timed out after ${timeoutMs}ms. Complete DBpia login in the opened browser and retry.`
    );
  } finally {
    if (ownsManager) {
      await manager.close();
    }
  }
}

export function logout(db: Database): void {
  clearSessions(db);
}

export function getSessionStatus(db: Database, now = new Date()): SessionStatus {
  const session = loadLatestValidSession(db, now);
  if (!session) {
    return {
      authenticated: false,
      authType: AuthType.UNKNOWN,
      institutionName: null,
      expiresAt: null,
    };
  }

  return {
    authenticated: true,
    authType: session.authType,
    institutionName: session.institutionName ?? null,
    expiresAt: session.expiresAt ?? null,
  };
}

export async function loginWithCredentials(
  db: Database,
  options: CredentialLoginOptions = {}
): Promise<RemoteSessionStatus> {
  const userId = resolveCredential(options.userId, ['DBPIA_USER_ID', 'DBPIA_LOGIN_ID']);
  const userPw = resolveCredential(options.userPw, ['DBPIA_USER_PW', 'DBPIA_LOGIN_PW']);
  if (!userId || !userPw) {
    throw new Error('DBpia credentials are missing. Set DBPIA_USER_ID/DBPIA_USER_PW (or DBPIA_LOGIN_ID/DBPIA_LOGIN_PW).');
  }

  const fetchFn = options.fetchFn ?? fetch;
  const form = new URLSearchParams({
    autoLogin: options.autoLogin ?? 'Y',
    idSave: options.idSave ?? 'Y',
    userId,
    userPw,
  });

  const loginResponse = await fetchFn(DEFAULT_LOGIN_POST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Origin: 'https://www.dbpia.co.kr',
      Referer: 'https://www.dbpia.co.kr/',
    },
    body: form.toString(),
    redirect: 'manual',
  });

  const setCookieLines = getSetCookieValues(loginResponse.headers);
  const cookies = parseSetCookieLines(setCookieLines);

  if (cookies.length === 0) {
    throw new Error('DBpia login did not return session cookies. Check credentials or endpoint changes.');
  }

  const maxExpiresSeconds = cookies
    .map((cookie) => cookie.expires)
    .filter((value) => Number.isFinite(value) && value > 0);
  const expiresAt = maxExpiresSeconds.length > 0
    ? new Date(Math.max(...maxExpiresSeconds) * 1_000).toISOString()
    : null;

  const myInfo = await fetchMyInfo(cookies, fetchFn);
  const status = buildStatusFromMyInfo(myInfo, expiresAt);

  if (!status.authenticated) {
    throw new Error('DBpia login failed. /member/me did not return authenticated user data.');
  }

  saveSession(db, {
    cookiesJson: JSON.stringify(cookies),
    authType: status.authType,
    institutionName: status.institutionName,
    expiresAt: status.expiresAt,
  });

  return status;
}

export async function getSessionStatusRemote(
  db: Database,
  options: SessionStatusOptions = {}
): Promise<RemoteSessionStatus> {
  const local = loadLatestValidSession(db, new Date());
  if (!local) {
    return {
      authenticated: false,
      authType: AuthType.UNKNOWN,
      institutionName: null,
      expiresAt: null,
      myInfo: null,
    };
  }

  const fetchFn = options.fetchFn ?? fetch;
  let cookies: Cookie[] = [];
  try {
    const parsed = JSON.parse(local.cookiesJson) as unknown;
    if (Array.isArray(parsed)) {
      cookies = parsed as Cookie[];
    }
  } catch {
    cookies = [];
  }

  const myInfo = await fetchMyInfo(cookies, fetchFn);
  return buildStatusFromMyInfo(myInfo, local.expiresAt ?? null);
}
