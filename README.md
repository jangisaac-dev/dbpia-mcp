# dbpia-mcp

[![npm version](https://img.shields.io/npm/v/dbpia-mcp.svg)](https://www.npmjs.com/package/dbpia-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[한국어](./README.ko.md) | English

MCP server for [DBpia](https://www.dbpia.co.kr) - Korea's largest academic paper database.

This server allows LLMs to search for academic papers, generate citations, cache results locally, and even index PDF content for full-text search.

## Features

- **Search**: Keyword and advanced search (author, publisher, journal)
- **Top Papers**: Browse popular/highly-rated papers by category/date
- **Citation**: Generate citations in Chicago, APA, MLA, BibTeX, Harvard, Vancouver
- **Open in Browser**: Open article pages directly in your default browser
- **Local Cache**: SQLite storage for offline access and export (7-day default cache)
- **Export**: Export cached data to JSONL format

## Installation

```bash
npx dbpia-mcp@latest
```

## API Key Setup

1. Visit [DBpia Open API Portal](https://api.dbpia.co.kr/openApi/index.do)
2. Register and get your API key from [Key Management](https://api.dbpia.co.kr/openApi/key/keyManage.do)

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DBPIA_API_KEY` | **Required**. Your DBpia Open API Key | - |
| `DBPIA_BUSINESS_API_KEY` | Optional. Required for `dbpia_detail` tool | - |
| `DBPIA_DB_PATH` | Directory for SQLite database | `~/.dbpia-mcp` |
| `DBPIA_DEBUG` | Enable verbose logging | `false` |
| `DBPIA_QUERY_TTL_DAYS` | Days to keep search results in cache | `7` |

### OpenCode / Claude Desktop Configuration

Add this to your `opencode.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dbpia": {
      "command": "npx",
      "args": ["dbpia-mcp@latest"],
      "env": {
        "DBPIA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Tools

### Search & Discovery

| Tool | Description | Arguments |
|------|-------------|-----------|
| `dbpia_search` | Simple keyword search | `searchall` (required), `page`, `pagecount`, `refresh` |
| `dbpia_search_advanced` | Search with specific fields | `searchall`, `searchauthor`, `searchpublisher`, `searchbook`, `page`, `pagecount` |
| `dbpia_top_papers` | Get popular papers | `pyear`, `pmonth` (req if pyear used), `category`, `page`, `pagecount` |
| `dbpia_local_search` | Search downloaded cache | `query` (required), `remoteFallback` (bool) |

### Utilities

| Tool | Description | Arguments |
|------|-------------|-----------|
| `dbpia_open` | Open article in browser | `articleId` (required) |
| `dbpia_cite` | Generate citation | `articleId` (required), `style` (chicago, apa, mla, bibtex, etc.) |
| `dbpia_export` | Export cache to JSONL | `outputPath` (required) |
| `dbpia_detail` | Get detailed metadata | `id` (required) - *Requires Business API Key* |

## Usage Examples

### 1. Search for Papers
**User Prompt:**
> "Find papers about 'Artificial Intelligence' published in 2024."

**Tool Call:**
```javascript
dbpia_search(searchall: "Artificial Intelligence", pyear: "2024")
```

### 2. Get a Citation
**User Prompt:**
> "Generate an APA citation for the first paper."

**Tool Call:**
```javascript
dbpia_cite(articleId: "NODE12345678", style: "apa")
```

### 3. Open Paper in Browser
**User Prompt:**
> "Open the detail page for this paper."

**Tool Call:**
```javascript
dbpia_open(articleId: "NODE12345678")
```

## License

MIT
