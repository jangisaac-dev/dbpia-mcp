# dbpia-mcp

[![npm version](https://img.shields.io/npm/v/dbpia-mcp.svg)](https://www.npmjs.com/package/dbpia-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[한국어](./README.ko.md) | English

MCP server for [DBpia](https://www.dbpia.co.kr) - Korea's largest academic paper database.

## Features

- **Search**: Keyword and advanced search (author, publisher, journal)
- **Top Papers**: Browse popular/highly-rated papers
- **Citation**: Generate citations in Chicago, APA, MLA, BibTeX, Harvard, Vancouver
- **Open in Browser**: Open article pages directly in your default browser
- **Fulltext Search**: Index PDFs and search content (OCR CLI hook supported)
- **Local Cache**: SQLite storage for offline access and export

## Installation

```bash
npx dbpia-mcp@latest
```

## API Key

1. Visit [DBpia Open API Portal](https://api.dbpia.co.kr/openApi/index.do)
2. Register and get API key from [Key Management](https://api.dbpia.co.kr/openApi/key/keyManage.do)

## Setup (OpenCode / Claude Desktop)

```jsonc
{
  "mcpServers": {
    "dbpia": {
      "command": "npx",
      "args": ["dbpia-mcp@latest"],
      "env": {
        "DBPIA_API_KEY": "your_api_key"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `dbpia_search` | Keyword search |
| `dbpia_search_advanced` | Advanced search (author, publisher, journal) |
| `dbpia_top_papers` | Popular/rated papers by year/month |
| `dbpia_local_search` | Search local cache |
| `dbpia_export` | Export cached articles to JSONL |
| `dbpia_open` | Open article page in browser |
| `dbpia_cite` | Generate citation (Chicago default) |
| `dbpia_fulltext_index` | Index PDF content (OCR supported) |
| `dbpia_fulltext_search` | Search indexed fulltext |

## Usage Examples

### Search Papers
```
dbpia_search(searchall: "인공지능", pagecount: 10)
```

### Open in Browser
```
dbpia_open(articleId: "NODE12345678")
```

### Generate Citation
```
dbpia_cite(articleId: "NODE12345678", style: "apa")
```

Supported styles: `chicago` (default), `apa`, `mla`, `bibtex`, `harvard`, `vancouver`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DBPIA_API_KEY` | API key (required) | - |
| `DBPIA_DB_PATH` | SQLite storage path | `~/.dbpia-mcp` |
| `DBPIA_BUSINESS_API_KEY` | Business API key (for article detail) | - |

## OCR Integration

Index scanned PDFs with your own OCR CLI:

```
dbpia_fulltext_index(
  articleId: "NODE123",
  pdfPath: "/path/to/paper.pdf",
  ocrCommand: "ocrmypdf {input} - | pdftotext - {output}"
)
```

## License

MIT
