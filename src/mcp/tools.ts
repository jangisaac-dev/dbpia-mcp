import Database from 'better-sqlite3';
import { runQuery } from '../dbpia/runQuery.js';
import { localSearch } from '../db/localSearch.js';
import { exportToJsonl } from '../export/jsonl.js';
import { loginToDbpia, checkLoginStatus, logoutFromDbpia, downloadPdf, isSessionActive } from '../browser/index.js';
import { formatCitation, type CitationStyle, type ArticleMetadata } from '../citation/index.js';
import { getArticleById, saveFulltext, searchFulltext } from '../db/articles.js';

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

export async function handleLogin(_db: Database.Database, args: any) {
  const { timeoutSeconds } = args;
  const result = await loginToDbpia(timeoutSeconds || 120);

  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: result as any
  };
}

export async function handleLogout(_db: Database.Database, _args: any) {
  const result = await logoutFromDbpia();

  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: result as any
  };
}

export async function handleLoginStatus(_db: Database.Database, _args: any) {
  const result = await checkLoginStatus();

  return {
    content: [{ type: 'text' as const, text: result.isLoggedIn ? `Logged in as ${result.username || 'unknown'}` : 'Not logged in' }],
    structuredContent: result as any
  };
}

export async function handleDownload(_db: Database.Database, args: any) {
  if (!isSessionActive()) {
    return {
      content: [{ type: 'text' as const, text: 'Not logged in. Call dbpia_login first.' }],
      structuredContent: { success: false, message: 'Not logged in' } as any
    };
  }

  const result = await downloadPdf({
    articleId: args.articleId,
    outputDir: args.outputDir,
    filename: args.filename,
  });

  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: result as any
  };
}

export async function handleCite(db: Database.Database, args: any) {
  const { articleId, style } = args;

  const article = getArticleById(db, articleId);
  if (!article) {
    return {
      content: [{ type: 'text' as const, text: `Article ${articleId} not found in local database. Search for it first.` }],
      structuredContent: { success: false, message: 'Article not found' } as any
    };
  }

  const rawJson = JSON.parse(article.raw_json);

  const metadata: ArticleMetadata = {
    id: article.id,
    title: article.title || rawJson.title || 'Untitled',
    authors: article.authors ? article.authors.split(', ') : [],
    journal: article.journal || rawJson.journal || 'Unknown Journal',
    volume: rawJson.volume,
    issue: rawJson.issue,
    pages: rawJson.pages,
    year: article.pub_year || new Date().getFullYear(),
    doi: rawJson.doi,
    url: `https://www.dbpia.co.kr/journal/articleDetail?nodeId=${article.id}`,
  };

  const result = formatCitation(metadata, style as CitationStyle);

  return {
    content: [{ type: 'text' as const, text: result.citation }],
    structuredContent: result as any
  };
}

export async function handleFulltextIndex(db: Database.Database, args: any) {
  const { articleId, pdfPath, ocrCommand } = args;

  const article = getArticleById(db, articleId);
  if (!article) {
    return {
      content: [{ type: 'text' as const, text: `Article ${articleId} not found.` }],
      structuredContent: { success: false, message: 'Article not found' } as any
    };
  }

  let fulltext = '';

  if (pdfPath) {
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    if (!fs.existsSync(pdfPath)) {
      return {
        content: [{ type: 'text' as const, text: `PDF file not found: ${pdfPath}` }],
        structuredContent: { success: false, message: 'PDF file not found' } as any
      };
    }

    if (ocrCommand) {
      const tempOutput = path.join(os.tmpdir(), `dbpia_ocr_${articleId}.txt`);
      const cmd = ocrCommand.replace('{input}', pdfPath).replace('{output}', tempOutput);
      
      try {
        execSync(cmd, { timeout: 300000 });
        if (fs.existsSync(tempOutput)) {
          fulltext = fs.readFileSync(tempOutput, 'utf-8');
          fs.unlinkSync(tempOutput);
        }
      } catch (e) {
        return {
          content: [{ type: 'text' as const, text: `OCR command failed: ${e instanceof Error ? e.message : String(e)}` }],
          structuredContent: { success: false, message: 'OCR failed' } as any
        };
      }
    } else {
      try {
        fulltext = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf-8', timeout: 60000 });
      } catch {
        return {
          content: [{ type: 'text' as const, text: 'pdftotext not available. Provide ocrCommand or install poppler-utils.' }],
          structuredContent: { success: false, message: 'pdftotext not available' } as any
        };
      }
    }
  }

  if (!fulltext.trim()) {
    return {
      content: [{ type: 'text' as const, text: 'No text extracted from PDF.' }],
      structuredContent: { success: false, message: 'No text extracted' } as any
    };
  }

  saveFulltext(db, articleId, fulltext);

  return {
    content: [{ type: 'text' as const, text: `Indexed ${fulltext.length} characters for article ${articleId}` }],
    structuredContent: { success: true, articleId, charCount: fulltext.length } as any
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
