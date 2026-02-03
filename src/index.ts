#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SearchSchema,
  AdvancedSearchSchema,
  TopPapersSchema,
  LocalSearchSchema,
  ExportSchema,
  DetailSchema
} from "./mcp/schemas.js";
import {
  handleSearch,
  handleAdvancedSearch,
  handleTopPapers,
  handleLocalSearch,
  handleExport,
  handleDetail
} from "./mcp/tools.js";
import { openDb, migrate } from "./db/index.js";
import path from "path";

const dbDir = process.env.DBPIA_DB_PATH || "/Volumes/ssd/opencode_workspace/dbpia_project";
const db = openDb({ dbDir });
migrate(db);

const server = new McpServer({
  name: "dbpia-mcp",
  version: "1.0.0",
});

server.tool(
  "dbpia_search",
  "Search DBpia articles using simple keyword.",
  SearchSchema,
  async (args) => handleSearch(db, args)
);

server.tool(
  "dbpia_search_advanced",
  "Search DBpia articles using advanced fields (author, publisher, book).",
  AdvancedSearchSchema,
  async (args) => handleAdvancedSearch(db, args)
);

server.tool(
  "dbpia_top_papers",
  "Get top rated papers by year, month or category.",
  TopPapersSchema,
  async (args) => handleTopPapers(db, args)
);

server.tool(
  "dbpia_local_search",
  "Search previously fetched articles in local SQLite database with optional remote fallback.",
  LocalSearchSchema,
  async (args) => handleLocalSearch(db, args)
);

server.tool(
  "dbpia_export",
  "Export all cached articles to a JSONL file.",
  ExportSchema,
  async (args) => handleExport(db, args)
);

if (process.env.DBPIA_BUSINESS_API_KEY) {
  server.tool(
    "dbpia_detail",
    "Get detailed information for a specific article (Requires Business API Key).",
    DetailSchema,
    async (args) => handleDetail(db, args)
  );
}

async function main() {
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
