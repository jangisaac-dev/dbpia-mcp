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
  LoginSchema,
  LogoutSchema,
  LoginStatusSchema,
  DownloadSchema,
  CiteSchema,
  FulltextIndexSchema,
  FulltextSearchSchema
} from "./mcp/schemas.js";
import {
  handleSearch,
  handleAdvancedSearch,
  handleTopPapers,
  handleLocalSearch,
  handleExport,
  handleDetail,
  handleLogin,
  handleLogout,
  handleLoginStatus,
  handleDownload,
  handleCite,
  handleFulltextIndex,
  handleFulltextSearch
} from "./mcp/tools.js";
import { openDb, migrate } from "./db/index.js";
import { closeBrowser } from "./browser/index.js";
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
    "dbpia_login",
    "Log in to DBpia with username/password for PDF downloads.",
    LoginSchema,
    safeTool("dbpia_login", (args) => handleLogin(db, args))
  );

  server.tool(
    "dbpia_logout",
    "Log out from DBpia.",
    LogoutSchema,
    safeTool("dbpia_logout", (args) => handleLogout(db, args))
  );

  server.tool(
    "dbpia_login_status",
    "Check current login status.",
    LoginStatusSchema,
    safeTool("dbpia_login_status", (args) => handleLoginStatus(db, args))
  );

  server.tool(
    "dbpia_download",
    "Download PDF for an article (requires login).",
    DownloadSchema,
    safeTool("dbpia_download", (args) => handleDownload(db, args))
  );

  server.tool(
    "dbpia_cite",
    "Generate citation for an article in various styles (Chicago default, APA, MLA, BibTeX, etc.).",
    CiteSchema,
    safeTool("dbpia_cite", (args) => handleCite(db, args))
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
    await closeBrowser();
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
