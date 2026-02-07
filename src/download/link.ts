import type Database from 'better-sqlite3';
import { getArticleNodeId, resolveArticleByAnyId } from '../db/articles.js';
import { AuthType, loadLatestValidSession } from '../auth/sessionStore.js';

const DETAIL_URL = 'https://www.dbpia.co.kr/journal/articleDetail';
const DOWNLOAD_DATA_URL = 'https://www.dbpia.co.kr/download/downloadData';

export interface DownloadRequestPayload {
  depth: string;
  shape: string;
  systemCode: string;
  nodeId: string;
}

export interface DownloadLinkResult {
  success: boolean;
  articleId: string;
  resolvedArticleId?: string;
  nodeId?: string;
  payload?: DownloadRequestPayload;
  detailUrl?: string;
  downloadUrl?: string;
  message: string;
  nextAction?: 'open_detail';
  rawResponse?: Record<string, unknown>;
}

interface SessionCookie {
  name: string;
  value: string;
}

export interface BuildDownloadLinkOptions {
  fetchFn?: typeof fetch;
  payloadOverrides?: Partial<Omit<DownloadRequestPayload, 'nodeId'>>;
}

export interface DetailContextResult {
  success: boolean;
  articleId: string;
  resolvedArticleId?: string;
  nodeId?: string;
  detailUrl?: string;
  payload?: DownloadRequestPayload;
  message: string;
  nextAction?: 'open_detail';
}

function parseSessionCookies(cookiesJson: string): SessionCookie[] {
  try {
    const parsed = JSON.parse(cookiesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const candidate = item as { name?: unknown; value?: unknown };
        if (typeof candidate.name !== 'string' || typeof candidate.value !== 'string') return null;
        return { name: candidate.name, value: candidate.value };
      })
      .filter((item): item is SessionCookie => item !== null);
  } catch {
    return [];
  }
}

function toCookieHeader(cookies: SessionCookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function extractHiddenValue(html: string, key: string): string | null {
  const inputPattern = new RegExp(`<input[^>]+name=["']${key}["'][^>]*value=["']([^"']+)["']`, 'i');
  const match = html.match(inputPattern);
  if (match?.[1]) return match[1];

  const scriptPattern = new RegExp(`${key}\\s*[:=]\\s*["']([^"']+)["']`, 'i');
  const scriptMatch = html.match(scriptPattern);
  return scriptMatch?.[1] ?? null;
}

function normalizeDepth(value: string | null | undefined): string {
  if (!value) {
    return 'Article';
  }

  const trimmed = value.trim();
  if (trimmed === '1') {
    return 'Article';
  }

  return trimmed;
}

export async function buildDownloadLink(
  db: Database.Database,
  articleIdOrNodeId: string,
  options: BuildDownloadLinkOptions = {}
): Promise<DownloadLinkResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const detailContext = await fetchDetailContext(db, articleIdOrNodeId, {
    fetchFn,
    payloadOverrides: options.payloadOverrides,
  });

  if (!detailContext.success || !detailContext.payload || !detailContext.detailUrl) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId: detailContext.resolvedArticleId,
      nodeId: detailContext.nodeId,
      detailUrl: detailContext.detailUrl,
      payload: detailContext.payload,
      message: detailContext.message,
      nextAction: detailContext.detailUrl ? 'open_detail' : undefined,
    };
  }

  const payload = detailContext.payload;
  const detailUrl = detailContext.detailUrl;
  const resolvedArticleId = detailContext.resolvedArticleId;
  const nodeId = detailContext.nodeId;

  const session = loadLatestValidSession(db);
  if (!session) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId,
      nodeId,
      detailUrl,
      payload,
      message: 'No authenticated DBpia session. Run dbpia_login first.',
      nextAction: 'open_detail',
    };
  }

  const cookies = parseSessionCookies(session.cookiesJson);
  const cookieHeader = toCookieHeader(cookies);
  if (!cookieHeader) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId,
      nodeId,
      detailUrl,
      payload,
      message: 'Stored session has no valid cookies. Run dbpia_login again.',
      nextAction: 'open_detail',
    };
  }

  const form = new URLSearchParams({
    depth: payload.depth,
    shape: payload.shape,
    systemCode: payload.systemCode,
    nodeId: payload.nodeId,
  });
  const dataResponse = await fetchFn(DOWNLOAD_DATA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
      Cookie: cookieHeader,
      Origin: 'https://www.dbpia.co.kr',
      Referer: detailUrl,
    },
    body: form.toString(),
  });

  if (!dataResponse.ok) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId,
      nodeId,
      detailUrl,
      payload,
      message: `downloadData request failed with status ${dataResponse.status}. Open detail page to continue manually.`,
      nextAction: 'open_detail',
    };
  }

  const raw = (await dataResponse.json()) as Record<string, unknown>;
  const downloadUrl = typeof raw.link === 'string' ? raw.link : undefined;
  if (!downloadUrl) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId,
      nodeId,
      detailUrl,
      payload,
      rawResponse: raw,
      message: 'downloadData response did not include a download link. Open detail page to continue manually.',
      nextAction: 'open_detail',
    };
  }

  return {
    success: true,
    articleId: articleIdOrNodeId,
    resolvedArticleId,
    nodeId,
    detailUrl,
    payload,
    downloadUrl,
    rawResponse: raw,
    message: 'Parsed download URL successfully.'
  };
}

export async function fetchDetailContext(
  db: Database.Database,
  articleIdOrNodeId: string,
  options: BuildDownloadLinkOptions = {}
): Promise<DetailContextResult> {
  const article = resolveArticleByAnyId(db, articleIdOrNodeId);
  if (!article) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      message: `Article ${articleIdOrNodeId} not found in local database.`
    };
  }

  const nodeId = getArticleNodeId(article);
  const resolvedArticleId = article.id;
  const detailUrl = `${DETAIL_URL}?nodeId=${encodeURIComponent(nodeId)}`;

  const session = loadLatestValidSession(db);
  if (!session) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId,
      nodeId,
      detailUrl,
      message: 'No authenticated DBpia session. Run dbpia_login first.'
    };
  }

  if (session.authType !== AuthType.INSTITUTION) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId,
      nodeId,
      detailUrl,
      message: 'Download URL parsing is only available for authorized institution sessions. Open detail page to continue manually.',
      nextAction: 'open_detail',
    };
  }

  const cookies = parseSessionCookies(session.cookiesJson);
  const cookieHeader = toCookieHeader(cookies);
  if (!cookieHeader) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId,
      nodeId,
      detailUrl,
      message: 'Stored session has no valid cookies. Run dbpia_login again.'
    };
  }

  const fetchFn = options.fetchFn ?? fetch;

  const detailResponse = await fetchFn(detailUrl, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Cookie: cookieHeader,
      Referer: 'https://www.dbpia.co.kr/',
    },
  });

  if (!detailResponse.ok) {
    return {
      success: false,
      articleId: articleIdOrNodeId,
      resolvedArticleId,
      nodeId,
      detailUrl,
      message: `Detail request failed with status ${detailResponse.status}.`
    };
  }

  const detailHtml = await detailResponse.text();

  const payload: DownloadRequestPayload = {
    depth: options.payloadOverrides?.depth ?? normalizeDepth(extractHiddenValue(detailHtml, 'depth')),
    shape: options.payloadOverrides?.shape ?? extractHiddenValue(detailHtml, 'shape') ?? 'download',
    systemCode: options.payloadOverrides?.systemCode ?? extractHiddenValue(detailHtml, 'systemCode') ?? '147003',
    nodeId,
  };

  return {
    success: true,
    articleId: articleIdOrNodeId,
    resolvedArticleId,
    nodeId,
    detailUrl,
    payload,
    message: 'Fetched detail context successfully.'
  };
}
