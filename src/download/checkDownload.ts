import { Page } from 'playwright';

export enum DownloadStatus {
  FREE = 'free',
  PAID = 'paid',
  UNAVAILABLE = 'unavailable',
  UNKNOWN = 'unknown',
}

export interface DownloadAvailability {
  status: DownloadStatus;
  price?: string;
  message?: string;
}

export const SELECTORS = {
  DOWNLOAD_BUTTON: '.btn_download',
  UNAVAILABLE_MESSAGE: '.unavailable_msg',
};

const DOWNLOAD_BUTTON_CANDIDATES = [
  SELECTORS.DOWNLOAD_BUTTON,
  '.btn_down',
  '.download_btn',
  'button.icon-btn.download',
  'button.gtm-z102',
  'button[id*="download"]',
  'button[class*="download"]',
  'a[href*="download"]',
  'a[href*="pdf"]'
];

async function findDownloadButton(page: Page): Promise<{ selector: string; button: Awaited<ReturnType<Page['$']>> } | null> {
  for (const selector of DOWNLOAD_BUTTON_CANDIDATES) {
    const buttons = await page.$$(selector);
    for (const button of buttons) {
      const canCheckVisibility = typeof button.isVisible === 'function';
      const isVisible = canCheckVisibility ? await button.isVisible() : true;
      if (!isVisible) {
        continue;
      }

      const canCheckEnabled = typeof button.isEnabled === 'function';
      const isEnabled = canCheckEnabled ? await button.isEnabled() : true;
      if (!isEnabled) {
        continue;
      }

      const text = ((await button.textContent()) || '').toLowerCase();
      const className = ((await button.getAttribute('class')) || '').toLowerCase();
      const href = ((await button.getAttribute('href')) || '').toLowerCase();

      const isLikelyAppDownload =
        text.includes('citeasy') ||
        text.includes('앱 다운로드') ||
        text.includes('스토어') ||
        href.includes('play.google.com') ||
        href.includes('apps.apple.com');

      if (isLikelyAppDownload) {
        continue;
      }

      const isLikelyPaperDownload =
        className.includes('download') ||
        text.includes('다운받기') ||
        text.includes('원문') ||
        text.includes('pdf') ||
        href.includes('download') ||
        href.includes('pdf');

      if (isLikelyPaperDownload) {
        return { selector, button };
      }
    }
  }
  return null;
}

export async function resolveDownloadButtonSelector(page: Page): Promise<string | null> {
  const match = await findDownloadButton(page);
  return match?.selector ?? null;
}

export async function checkDownloadAvailability(
  page: Page,
  articleIdOrUrl: string
): Promise<DownloadAvailability> {
  const url = articleIdOrUrl.startsWith('http')
    ? articleIdOrUrl
    : `https://www.dbpia.co.kr/journal/articleDetail?nodeId=${articleIdOrUrl}`;

  const currentUrl = page.url();
  if (currentUrl !== url && currentUrl !== 'about:blank') {
    await page.goto(url);
  }

  const match = await findDownloadButton(page);
  if (match?.button) {
    const className = (await match.button.getAttribute('class')) || '';
    const text = (await match.button.textContent()) || '';
    const combined = `${className} ${text}`.toLowerCase();

    if (combined.includes('free') || combined.includes('무료')) {
      return { status: DownloadStatus.FREE };
    }

    if (combined.includes('paid') || combined.includes('유료') || combined.includes('결제')) {
      const priceMatch = text.match(/\(([^)]+)\)/);
      return {
        status: DownloadStatus.PAID,
        price: priceMatch ? priceMatch[1] : undefined,
      };
    }

    return { status: DownloadStatus.FREE };
  }

  const unavailableMsg = await page.$(SELECTORS.UNAVAILABLE_MESSAGE);
  if (unavailableMsg) {
    const message = (await unavailableMsg.innerText()) || '';
    return {
      status: DownloadStatus.UNAVAILABLE,
      message,
    };
  }

  return { status: DownloadStatus.UNKNOWN };
}
