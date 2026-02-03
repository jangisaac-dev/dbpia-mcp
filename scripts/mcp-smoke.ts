import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";
import path from "path";
import os from "os";

async function runSmokeTest() {
  console.log("Starting MCP Smoke Test...");

  const tempDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "dbpia-smoke-"));
  const tempExportPath = path.join(tempDbPath, "export.jsonl");

  console.log(`Using temp DB path: ${tempDbPath}`);

  const serverPath = path.resolve("dist/index.js");
  
  if (!fs.existsSync(serverPath)) {
    console.error(`Server not found at ${serverPath}. Please run 'npm run build' first.`);
    process.exit(1);
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: {
      ...process.env,
      DBPIA_DB_PATH: tempDbPath,
      DBPIA_API_KEY: "dummy-key", 
      DBPIA_BASE_URL: "http://localhost:9999", 
    },
  });

  const client = new Client(
    {
      name: "smoke-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log("Connected to MCP server.");

    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);
    console.log("Available tools:", toolNames);

    const requiredTools = [
      "dbpia_search",
      "dbpia_search_advanced",
      "dbpia_top_papers",
      "dbpia_local_search",
      "dbpia_export",
    ];

    for (const tool of requiredTools) {
      if (!toolNames.includes(tool)) {
        throw new Error(`Missing tool: ${tool}`);
      }
    }
    console.log("✅ All required tools are present.");

    console.log("Calling dbpia_local_search...");
    const localSearchResult = await client.callTool({
      name: "dbpia_local_search",
      arguments: {
        query: "test",
        remoteFallback: false,
      },
    });
    console.log("dbpia_local_search response received.");
    if (localSearchResult.isError) {
      throw new Error(`dbpia_local_search failed: ${JSON.stringify(localSearchResult)}`);
    }
    console.log("✅ dbpia_local_search succeeded (offline).");

    console.log(`Calling dbpia_export to ${tempExportPath}...`);
    const exportResult = await client.callTool({
      name: "dbpia_export",
      arguments: {
        outputPath: tempExportPath,
      },
    });
    console.log("dbpia_export response received.");
    if (exportResult.isError) {
      throw new Error(`dbpia_export failed: ${JSON.stringify(exportResult)}`);
    }
    console.log("✅ dbpia_export succeeded.");

    console.log("MCP Smoke Test PASSED! 🚀");
    process.exit(0);
  } catch (error) {
    console.error("MCP Smoke Test FAILED! ❌");
    console.error(error);
    process.exit(1);
  } finally {
    try {
      if (fs.existsSync(tempDbPath)) {
        fs.rmSync(tempDbPath, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("Failed to cleanup temp path:", e);
    }
  }
}

runSmokeTest();
