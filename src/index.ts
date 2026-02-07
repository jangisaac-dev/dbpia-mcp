#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SearchSchema,
  AdvancedSearchSchema,
  TopPapersSchema,
  LocalSearchSchema,
  ExportSchema,
  DetailSchema,
  OpenArticleSchema,
  LoginSchema,
  SessionStatusSchema,
  CiteSchema,
  CiteasySchema,
  FulltextIndexSchema,
  FulltextSearchSchema,
  CheckDownloadSchema,
  DownloadSchema,
  DownloadLinkSchema,
  PdfListSchema,
  PdfInfoSchema,
  PdfOpenSchema,
  PdfDeleteSchema,
  PdfRegisterSchema
} from "./mcp/schemas.js";
import {
  handleSearch,
  handleAdvancedSearch,
  handleTopPapers,
  handleLocalSearch,
  handleExport,
  handleDetail,
  handleOpenArticle,
  handleLogin,
  handleSessionStatus,
  handleCite,
  handleCiteasy,
  handleFulltextIndex,
  handleFulltextSearch,
  handleCheckDownload,
  handleDownload,
  handleDownloadLink,
  handlePdfList,
  handlePdfInfo,
  handlePdfOpen,
  handlePdfDelete,
  handlePdfRegister
} from "./mcp/tools.js";
import { openDb, migrate } from "./db/index.js";
import path from "path";
import os from "os";

function defaultDbDir(): string {
  const home = os.homedir();
  return path.join(home, ".dbpia-mcp");
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  return String(err);
}

function safeTool<TArgs>(name: string, fn: (args: TArgs) => Promise<any>) {
  return async (args: TArgs) => {
    try {
      if (process.env.DBPIA_DEBUG === 'true') {
        console.error(`[tool:${name}]`, JSON.stringify(args));
      }
      return await fn(args);
    } catch (err) {
      const msg = formatError(err);
      console.error(msg);
      return {
        isError: true,
        content: [{ type: 'text' as const, text: msg }],
      };
    }
  };
}

const server = new McpServer({
  name: "dbpia-mcp",
  version: "1.0.0",
});

type Db = ReturnType<typeof openDb>;

function registerTools(db: Db): void {
  server.tool(
    "dbpia_search",
    "Search DBpia articles using simple keyword.",
    SearchSchema,
    safeTool("dbpia_search", (args) => handleSearch(db, args))
  );

  server.tool(
    "dbpia_search_advanced",
    "Search DBpia articles using advanced fields (author, publisher, book).",
    AdvancedSearchSchema,
    safeTool("dbpia_search_advanced", (args) => handleAdvancedSearch(db, args))
  );

  server.tool(
    "dbpia_top_papers",
    "Get top rated papers by year, month or category.",
    TopPapersSchema,
    safeTool("dbpia_top_papers", (args) => handleTopPapers(db, args))
  );

  server.tool(
    "dbpia_local_search",
    "Search previously fetched articles in local SQLite database with optional remote fallback.",
    LocalSearchSchema,
    safeTool("dbpia_local_search", (args) => handleLocalSearch(db, args))
  );

  server.tool(
    "dbpia_export",
    "Export all cached articles to a JSONL file.",
    ExportSchema,
    safeTool("dbpia_export", (args) => handleExport(db, args))
  );

  if (process.env.DBPIA_BUSINESS_API_KEY) {
    server.tool(
      "dbpia_detail",
      "Get detailed information for a specific article (Requires Business API Key).",
      DetailSchema,
      safeTool("dbpia_detail", (args) => handleDetail(db, args))
    );
  }

  server.tool(
    "dbpia_open",
    "Open article page in default browser for viewing or downloading PDF.",
    OpenArticleSchema,
    safeTool("dbpia_open", (args) => handleOpenArticle(db, args))
  );

  server.tool(
    "dbpia_login",
    "Login to DBpia with credentials and persist session cookies.",
    LoginSchema,
    safeTool("dbpia_login", (args) => handleLogin(db, args))
  );

  server.tool(
    "dbpia_session_status",
    "Check current DBpia login session status.",
    SessionStatusSchema,
    safeTool("dbpia_session_status", (args) => handleSessionStatus(db, args))
  );

  server.tool(
    "dbpia_cite",
    "Generate citation for an article in various styles (Chicago default, APA, MLA, BibTeX, etc.).",
    CiteSchema,
    safeTool("dbpia_cite", (args) => handleCite(db, args))
  );

  server.tool(
    "dbpia_citeasy",
    "Run citation pipeline: optional download + PDF state lookup + citation formatting.",
    CiteasySchema,
    safeTool("dbpia_citeasy", (args) => handleCiteasy(db, args))
  );

  server.tool(
    "dbpia_fulltext_index",
    "Index fulltext from PDF for searching (supports OCR CLI hook).",
    FulltextIndexSchema,
    safeTool("dbpia_fulltext_index", (args) => handleFulltextIndex(db, args))
  );

  server.tool(
    "dbpia_fulltext_search",
    "Search indexed fulltext content.",
    FulltextSearchSchema,
    safeTool("dbpia_fulltext_search", (args) => handleFulltextSearch(db, args))
  );

  server.tool(
    "dbpia_check_download",
    "Check whether an article is free, paid, or unavailable for download.",
    CheckDownloadSchema,
    safeTool("dbpia_check_download", (args) => handleCheckDownload(db, args))
  );

  server.tool(
    "dbpia_download",
    "Download article PDF when available (assumes active login session).",
    DownloadSchema,
    safeTool("dbpia_download", (args) => handleDownload(db, args))
  );

  server.tool(
    "dbpia_download_link",
    "Parse DBpia downloadData response and return final download URL.",
    DownloadLinkSchema,
    safeTool("dbpia_download_link", (args) => handleDownloadLink(db, args))
  );

  server.tool(
    "dbpia_pdf_list",
    "List managed PDF files with optional filters.",
    PdfListSchema,
    safeTool("dbpia_pdf_list", (args) => handlePdfList(db, args))
  );

  server.tool(
    "dbpia_pdf_info",
    "Get metadata for a managed PDF.",
    PdfInfoSchema,
    safeTool("dbpia_pdf_info", (args) => handlePdfInfo(db, args))
  );

  server.tool(
    "dbpia_pdf_open",
    "Open a managed PDF in the default system viewer.",
    PdfOpenSchema,
    safeTool("dbpia_pdf_open", (args) => handlePdfOpen(db, args))
  );

  server.tool(
    "dbpia_pdf_delete",
    "Delete a managed PDF and update metadata.",
    PdfDeleteSchema,
    safeTool("dbpia_pdf_delete", (args) => handlePdfDelete(db, args))
  );

  server.tool(
    "dbpia_pdf_register",
    "Register an existing local PDF to an article or as standalone.",
    PdfRegisterSchema,
    safeTool("dbpia_pdf_register", (args) => handlePdfRegister(db, args))
  );
}

async function main() {
  const dbDir = process.env.DBPIA_DB_PATH || defaultDbDir();
  const db = openDb({ dbDir });
  migrate(db);

  registerTools(db);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DBpia MCP Server running on stdio");

  const keepAlive = setInterval(() => {}, 60000);

  const shutdown = async () => {
    clearInterval(keepAlive);
    await server.close();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.stdin.resume();
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
