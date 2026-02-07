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
- **PDF Full-text Indexing**: OCR/index PDF text with pluggable providers (local & cloud)

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
| `DBPIA_USER_ID` | Optional. DBpia login ID for `dbpia_login` | - |
| `DBPIA_USER_PW` | Optional. DBpia login password for `dbpia_login` | - |
| `DBPIA_DB_PATH` | Directory for SQLite database | `~/.dbpia-mcp` |
| `DBPIA_DEBUG` | Enable verbose logging | `false` |
| `DBPIA_QUERY_TTL_DAYS` | Days to keep search results in cache | `7` |
| `DBPIA_OCR_CMD_OWLOCR` | Command template for OwlOCR provider | - |
| `DBPIA_OCR_CMD_TESSERACT` | Command template for Tesseract provider | - |
| `DBPIA_OCR_CMD_PDFTOTEXT` | Command template for pdftotext provider | - |
| `DBPIA_OCR_CMD_PADDLEOCR` | Command template for PaddleOCR provider | - |
| `DBPIA_OCR_CMD_EASYOCR` | Command template for EasyOCR provider | - |
| `DBPIA_OCR_CMD_GOOGLE_VISION` | Command template for Google Vision provider | - |
| `DBPIA_OCR_CMD_AZURE_READ` | Command template for Azure Read provider | - |
| `DBPIA_OCR_CMD_AWS_TEXTRACT` | Command template for AWS Textract provider | - |
| `DBPIA_OCR_CMD_OCR_SPACE` | Command template for OCR.Space provider | - |

### OpenCode configuration (opencode.json)

OpenCode configures MCP servers under `mcp` (not `mcpServers`).

There is **no separate `args` field** in OpenCode. Put the executable + arguments into the `command` **array**.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dbpia": {
      "type": "local",
      "command": ["npx", "-y", "dbpia-mcp@latest"],
      "enabled": true,
      "environment": {
        "DBPIA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Code configuration (.mcp.json)

Claude Code uses its own MCP config files. For **project-scoped** configuration, add a `.mcp.json` at your project root (see Claude Code MCP docs).

**Option A: configure via JSON**

```json
{
  "mcpServers": {
    "dbpia": {
      "command": "npx",
      "args": ["-y", "dbpia-mcp@latest"],
      "env": {
        "DBPIA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

**Option B: configure via Claude Code CLI**

```bash
claude mcp add --transport stdio --env DBPIA_API_KEY=your_api_key_here dbpia \
  -- npx -y dbpia-mcp@latest
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
| `dbpia_login` | Login with environment or explicit credentials and persist cookies | `userId`, `userPw`, `autoLogin`, `idSave` |
| `dbpia_session_status` | Check saved session (optionally via `/member/me`) | `remote` (default true) |
| `dbpia_cite` | Generate citation | `articleId` (required), `style` (chicago, apa, mla, bibtex, etc.) |
| `dbpia_download_link` | Parse `downloadData` and return final download URL | `articleId` (required), `depth`, `shape`, `systemCode` |
| `dbpia_export` | Export cache to JSONL | `outputPath` (required) |
| `dbpia_detail` | Get detailed metadata | `id` (required) - *Requires Business API Key* |

### Login and Download Permission Policy

- Search tools work with API keys only.
- Download-related tools require authenticated DBpia session cookies.
- `dbpia_login` uses either explicit args (`userId`, `userPw`) or environment variables:
  - `DBPIA_USER_ID` / `DBPIA_USER_PW`
  - fallback aliases: `DBPIA_LOGIN_ID` / `DBPIA_LOGIN_PW`
- `dbpia_download_link` is restricted to authorized institution sessions.
  - If parsing is not possible (no session / non-institution / no link), response includes guidance and `nextAction: "open_detail"` with `detailUrl` so user can continue on the detail page.

#### Recommended flow

1. `dbpia_search` to find article
2. `dbpia_login` to persist session cookies
3. `dbpia_session_status` to verify authentication and institution status
4. `dbpia_download_link` to parse final download URL
5. If `success=false` and `nextAction="open_detail"`, open `detailUrl` and proceed manually

### Full-text & OCR

| Tool | Description | Arguments |
|------|-------------|-----------|
| `dbpia_fulltext_index` | OCR/index PDF into article fulltext | `articleId` (required), `pdfPath`, `provider`, `fallbackProviders`, `languages`, `pages`, `dpi`, `timeoutMs`, `commandTemplate`, `providerCommands` |
| `dbpia_fulltext_search` | Search indexed fulltext | `query` (required), `limit` |

#### OCR Providers (non-Owl supported)

You can choose local or third-party OCR providers:

- Local: `tesseract`, `pdftotext`, `paddleocr`, `easyocr`
- Cloud/3rd-party: `google-vision`, `azure-read`, `aws-textract`, `ocr-space`
- `auto`: tries fallback chain (`owlocr -> tesseract -> pdftotext`) unless overridden

Set provider-specific command templates via env vars (or pass `providerCommands` in tool args).

Template placeholders:
- `{input}` PDF path
- `{output}` output text file path
- `{langs}` language code string (e.g., `kor+eng`)
- `{dpi}` DPI value
- `{pages}` page selector

Example command templates:

```bash
export DBPIA_OCR_CMD_TESSERACT='tesseract "{input}" stdout -l {langs} --oem 1 --psm 6'
export DBPIA_OCR_CMD_PDFTOTEXT='pdftotext "{input}" -'
```

Example tool call:

```javascript
dbpia_fulltext_index(
  articleId: "NODE12345678",
  pdfPath: "/path/to/paper.pdf",
  provider: "paddleocr",
  fallbackProviders: ["tesseract", "pdftotext"],
  languages: ["ko", "en"],
  timeoutMs: 180000
)
```

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
