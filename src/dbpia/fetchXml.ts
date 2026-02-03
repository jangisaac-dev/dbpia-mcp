import iconv from 'iconv-lite';

export const DEFAULT_BASE_URL = 'http://api.dbpia.co.kr';
export const DEFAULT_PATH = '/v2/search/search.xml';

export interface FetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  baseUrl?: string;
}

export interface FetchResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  xml: string;
}

export function buildDbpiaUrl(
  params: Record<string, string | number | boolean | undefined>,
  baseUrl: string = DEFAULT_BASE_URL
): string {
  const url = new URL(DEFAULT_PATH, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

export async function fetchDbpiaXml(
  params: Record<string, string | number | boolean | undefined>,
  opts: FetchOptions = {}
): Promise<FetchResult> {
  const {
    timeoutMs = 10000,
    maxRetries = 2,
    retryBackoffMs = 1000,
    baseUrl = process.env.DBPIA_BASE_URL || DEFAULT_BASE_URL,
  } = opts;

  const url = buildDbpiaUrl(params, baseUrl);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/xml',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('Content-Type') || '';
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      const charset = charsetMatch ? charsetMatch[1].trim().toLowerCase() : 'utf-8';

      const buffer = await response.arrayBuffer();
      let xml: string;

      if (charset !== 'utf-8' && charset !== 'utf8') {
        xml = iconv.decode(Buffer.from(buffer), charset);
      } else {
        xml = new TextDecoder().decode(buffer);
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        url,
        status: response.status,
        headers,
        xml,
      };
    } catch (error: any) {
      lastError = error;
      
      const isAbort = error.name === 'AbortError';
      const isServerError = error.message && error.message.includes('HTTP Error: 5');
      const shouldRetry = isAbort || isServerError;
      
      if (shouldRetry && attempt < maxRetries) {
        const backoff = retryBackoffMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Unknown error during fetch');
}
