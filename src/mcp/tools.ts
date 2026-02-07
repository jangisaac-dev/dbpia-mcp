import Database from 'better-sqlite3';
import { runQuery } from '../dbpia/runQuery.js';
import { localSearch } from '../db/localSearch.js';
import { exportToJsonl } from '../export/jsonl.js';
import { openInBrowser, getArticleUrl } from '../browser/open.js';
import { formatCitation, type CitationStyle, type ArticleMetadata, type CitationResult } from '../citation/index.js';
import { getArticleById, searchFulltext, type ArticleRow } from '../db/articles.js';
import { createDefaultOcrClient, processWithOcr, type OcrConfig } from '../ocr/interface.js';
import { checkDownloadAvailability } from '../download/checkDownload.js';
import { downloadPdf } from '../download/download.js';
import { buildDownloadLink } from '../download/link.js';
import { deletePdf, getPdfInfo, listPdfs, openPdfById, registerExternalPdf } from '../pdf/manager.js';
import { PlaywrightManager } from '../browser/playwright.js';
import { getSessionStatus, getSessionStatusRemote, loginWithCredentials } from '../auth/login.js';

const WHITELISTED_PARAMS = [
  'searchall', 'searchauthor', 'searchpublisher', 'searchbook',
  'pyear', 'pmonth', 'category',
  'freeyn', 'priceyn', 'sorttype', 'sortorder',
  'pyear_start', 'pyear_end', 'itype', 'collection'
];

function filterParams(params: Record<string, any> = {}): Record<string, any> {
  const filtered: Record<string, any> = {};
  for (const key of WHITELISTED_PARAMS) {
    if (params[key] !== undefined) {
      filtered[key] = params[key];
    }
  }

  if (filtered.itype && filtered.collection) {
    throw new Error('itype and collection are mutually exclusive');
  }

  return filtered;
}

function parseAuthors(authorsRaw: string): string[] {
  if (!authorsRaw || !authorsRaw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(authorsRaw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter((item) => item.length > 0);
    }
  } catch {
    // fall back to delimiter parsing
  }

  return authorsRaw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildArticleMetadata(article: ArticleRow): ArticleMetadata {
  let rawJson: Record<string, unknown> = {};
  try {
    rawJson = JSON.parse(article.raw_json) as Record<string, unknown>;
  } catch {
    rawJson = {};
  }

  const titleFromRaw = typeof rawJson.title === 'string' ? rawJson.title : undefined;
  const journalFromRaw = typeof rawJson.journal === 'string' ? rawJson.journal : undefined;

  return {
    id: article.id,
    title: article.title || titleFromRaw || 'Untitled',
    authors: parseAuthors(article.authors),
    journal: article.journal || journalFromRaw || 'Unknown Journal',
    volume: typeof rawJson.volume === 'string' ? rawJson.volume : undefined,
    issue: typeof rawJson.issue === 'string' ? rawJson.issue : undefined,
    pages: typeof rawJson.pages === 'string' ? rawJson.pages : undefined,
    year: article.pub_year || new Date().getFullYear(),
    doi: typeof rawJson.doi === 'string' ? rawJson.doi : undefined,
    url: `https://www.dbpia.co.kr/journal/articleDetail?nodeId=${article.id}`,
  };
}

function buildCitationForArticle(
  db: Database.Database,
  articleId: string,
  style: CitationStyle = 'chicago'
): { ok: true; article: ArticleRow; citation: CitationResult } | { ok: false; message: string } {
  const article = getArticleById(db, articleId);
  if (!article) {
    return { ok: false, message: `Article ${articleId} not found in local database. Search for it first.` };
  }

  const metadata = buildArticleMetadata(article);
  const citation = formatCitation(metadata, style);
  return { ok: true, article, citation };
}

export async function handleSearch(db: Database.Database, args: any) {
  const { extraParams, refresh, page, pagecount, ...core } = args;
  const params = { ...filterParams(core), ...filterParams(extraParams) };

  const result = await runQuery({
    db,
    tool: 'dbpia_search',
    target: 'se',
    params,
    page,
    pagecount,
    refresh
  });

  return {
    content: [{ type: 'text' as const, text: `Found ${result.items.length} articles.` }],
    structuredContent: result as any
  };
}

export async function handleAdvancedSearch(db: Database.Database, args: any) {
  const { extraParams, refresh, page, pagecount, ...core } = args;
  const params = { ...filterParams(core), ...filterParams(extraParams) };

  const result = await runQuery({
    db,
    tool: 'dbpia_search_advanced',
    target: 'se_adv',
    params,
    page,
    pagecount,
    refresh
  });

  return {
    content: [{ type: 'text' as const, text: `Found ${result.items.length} articles via advanced search.` }],
    structuredContent: result as any
  };
}

export async function handleTopPapers(db: Database.Database, args: any) {
  const { extraParams, refresh, page, pagecount, ...core } = args;
  const params = { ...filterParams(core), ...filterParams(extraParams) };

  if (params.pyear && !params.pmonth) {
    throw new Error('pmonth is required when pyear is provided for top papers');
  }

  const result = await runQuery({
    db,
    tool: 'dbpia_top_papers',
    target: 'rated_art',
    params,
    page,
    pagecount,
    refresh
  });

  return {
    content: [{ type: 'text' as const, text: `Found ${result.items.length} top papers.` }],
    structuredContent: result as any
  };
}

export async function handleLocalSearch(db: Database.Database, args: any) {
  const { query, remoteFallback, page, pagecount } = args;
  let items = localSearch(db, query);

  if (items.length === 0 && remoteFallback) {
    const result = await runQuery({
      db,
      tool: 'dbpia_local_search_fallback',
      target: 'se_adv',
      params: { searchall: query },
      page,
      pagecount
    });
    items = result.items;
  }

  return {
    content: [{ type: 'text' as const, text: `Found ${items.length} articles locally${items.length === 0 && remoteFallback ? ' (after remote fallback)' : ''}.` }],
    structuredContent: { items } as any
  };
}

export async function handleExport(db: Database.Database, args: any) {
  const { outputPath } = args;
  const result = exportToJsonl(db, outputPath);

  return {
    content: [{ type: 'text' as const, text: `Exported ${result.count} articles to ${result.path}` }],
    structuredContent: result as any
  };
}

export async function handleDetail(db: Database.Database, args: any) {
  const { id, refresh } = args;
  
  const businessKey = process.env.DBPIA_BUSINESS_API_KEY;

  const result = await runQuery({
    db,
    tool: 'dbpia_detail',
    target: 'detail',
    params: { id },
    refresh,
    apiKeyOverride: businessKey
  });

  return {
    content: [{ type: 'text' as const, text: `Retrieved details for article ${id}.` }],
    structuredContent: result as any
  };
}

export async function handleOpenArticle(_db: Database.Database, args: any) {
  const { articleId } = args;
  const url = getArticleUrl(articleId);
  const result = await openInBrowser(url);

  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: { ...result, url } as any
  };
}

export async function handleLogin(db: Database.Database, args: any) {
  const { userId, userPw, autoLogin, idSave } = args;
  const result = await loginWithCredentials(db, {
    userId,
    userPw,
    autoLogin,
    idSave,
  });

  return {
    content: [{ type: 'text' as const, text: result.authenticated ? 'Login succeeded and session cookies saved.' : 'Login failed.' }],
    structuredContent: result,
  };
}

export async function handleSessionStatus(db: Database.Database, args: any) {
  const { remote = true } = args;
  const result = remote ? await getSessionStatusRemote(db) : getSessionStatus(db);

  return {
    content: [{ type: 'text' as const, text: result.authenticated ? 'Authenticated session is available.' : 'No authenticated session.' }],
    structuredContent: result,
  };
}

export async function handleCite(db: Database.Database, args: any) {
  const { articleId, style } = args;
  const citationResult = buildCitationForArticle(db, articleId, style as CitationStyle | undefined);

  if (!citationResult.ok) {
    return {
      content: [{ type: 'text' as const, text: citationResult.message }],
      structuredContent: { success: false, message: 'Article not found' }
    };
  }

  return {
    content: [{ type: 'text' as const, text: citationResult.citation.citation }],
    structuredContent: citationResult.citation
  };
}

interface CiteasyDependencies {
  download?: typeof downloadPdf;
}

export async function handleCiteasy(db: Database.Database, args: any, deps: CiteasyDependencies = {}) {
  const { articleId, style, download = true, overwrite = false, timeoutMs, autoLogin = false } = args;
  const citationResult = buildCitationForArticle(db, articleId, style as CitationStyle | undefined);

  if (!citationResult.ok) {
    return {
      content: [{ type: 'text' as const, text: citationResult.message }],
      structuredContent: { success: false, message: 'Article not found' }
    };
  }

  const runDownload = deps.download ?? downloadPdf;
  const downloadResult = download
    ? await runDownload(db, articleId, { overwrite, timeoutMs, autoLogin })
    : null;

  const pdf = getPdfInfo(db, `article:${articleId}`);
  const downloadStatus = downloadResult?.status ?? 'skipped';

  return {
    content: [{ type: 'text' as const, text: citationResult.citation.citation }],
    structuredContent: {
      success: true,
      articleId,
      download: downloadResult,
      downloadStatus,
      pdf,
      citation: citationResult.citation
    }
  };
}

export async function handleFulltextIndex(db: Database.Database, args: any) {
  const {
    articleId,
    pdfPath,
    ocrCommand,
    provider,
    fallbackProviders,
    languages,
    pages,
    dpi,
    timeoutMs,
    providerCommands,
    commandTemplate
  } = args;

  const article = getArticleById(db, articleId);
  if (!article) {
    return {
      content: [{ type: 'text' as const, text: `Article ${articleId} not found.` }],
      structuredContent: { success: false, message: 'Article not found' } as any
    };
  }

  if (pdfPath) {
    const fs = await import('fs');
    if (!fs.existsSync(pdfPath)) {
      return {
        content: [{ type: 'text' as const, text: `PDF file not found: ${pdfPath}` }],
        structuredContent: { success: false, message: 'PDF file not found' } as any
      };
    }

    db.prepare('UPDATE articles SET pdf_path = ?, download_status = ? WHERE id = ?').run(pdfPath, 'downloaded', articleId);
  }

  const ocrConfig: OcrConfig = {
    provider,
    fallbackProviders,
    languages,
    pages,
    dpi,
    timeoutMs,
    commandTemplate,
    providerCommands
  };

  if (ocrCommand && !ocrConfig.commandTemplate) {
    ocrConfig.commandTemplate = ocrCommand;
  }

  const client = createDefaultOcrClient();
  const ocrResult = await processWithOcr(db, `article:${articleId}`, ocrConfig, client);

  if (!ocrResult.success || !ocrResult.text?.trim()) {
    return {
      content: [{ type: 'text' as const, text: ocrResult.message || 'No text extracted from PDF.' }],
      structuredContent: { success: false, message: ocrResult.message || 'No text extracted' } as any
    };
  }

  return {
    content: [{ type: 'text' as const, text: `Indexed ${ocrResult.text.length} characters for article ${articleId} using ${ocrResult.provider || 'configured provider'}` }],
    structuredContent: { success: true, articleId, charCount: ocrResult.text.length, provider: ocrResult.provider } as any
  };
}

export async function handleFulltextSearch(db: Database.Database, args: any) {
  const { query, limit } = args;
  const results = searchFulltext(db, query, limit || 20);

  return {
    content: [{ type: 'text' as const, text: `Found ${results.length} articles matching "${query}"` }],
    structuredContent: { items: results } as any
  };
}

export async function handleCheckDownload(_db: Database.Database, args: any) {
  const { articleId } = args;
  const manager = new PlaywrightManager();

  try {
    const context = await manager.createContext();
    const page = await context.newPage();
    const result = await checkDownloadAvailability(page, articleId);

    return {
      content: [{ type: 'text' as const, text: `Download status for ${articleId}: ${result.status}` }],
      structuredContent: result
    };
  } finally {
    await manager.close();
  }
}

export async function handleDownload(db: Database.Database, args: any) {
  const { articleId, overwrite, timeoutMs, autoLogin } = args;
  const result = await downloadPdf(db, articleId, {
    overwrite,
    timeoutMs,
    autoLogin
  });

  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: result
  };
}

export async function handleDownloadLink(db: Database.Database, args: any) {
  const { articleId, depth, shape, systemCode } = args;
  const result = await buildDownloadLink(db, articleId, {
    payloadOverrides: {
      depth,
      shape,
      systemCode,
    },
  });

  const detailHint = result.nextAction === 'open_detail' && result.detailUrl
    ? ` Open detail page: ${result.detailUrl}`
    : '';

  return {
    content: [{ type: 'text' as const, text: `${result.message}${detailHint}` }],
    structuredContent: result,
  };
}

export async function handlePdfList(db: Database.Database, args: any) {
  const { year, journal, title } = args;
  const items = listPdfs(db, { year, journal, title });

  return {
    content: [{ type: 'text' as const, text: `Found ${items.length} PDF files.` }],
    structuredContent: { items }
  };
}

export async function handlePdfInfo(db: Database.Database, args: any) {
  const { id } = args;
  const info = getPdfInfo(db, id);

  if (!info) {
    return {
      content: [{ type: 'text' as const, text: `PDF ${id} not found.` }],
      structuredContent: { success: false, message: 'PDF not found' }
    };
  }

  return {
    content: [{ type: 'text' as const, text: `Retrieved PDF info for ${id}.` }],
    structuredContent: { success: true, item: info }
  };
}

export async function handlePdfOpen(db: Database.Database, args: any) {
  const { id } = args;
  const result = await openPdfById(db, id);

  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: result
  };
}

export async function handlePdfDelete(db: Database.Database, args: any) {
  const { id } = args;
  const result = await deletePdf(db, id);

  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: result
  };
}

export async function handlePdfRegister(db: Database.Database, args: any) {
  const result = await registerExternalPdf(db, args);

  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: result
  };
}
