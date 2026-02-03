# dbpia-mcp

DBpia MCP server with PDF download, citation generation, and fulltext search.

## Features

- **Search**: Keyword and advanced search
- **PDF Download**: Automated login + download (Playwright)
- **Citation**: Chicago (default), APA, MLA, BibTeX, Harvard, Vancouver
- **Fulltext Search**: Index PDFs and search content (OCR CLI hook supported)
- **Local Cache**: SQLite storage for offline access

## Installation

```bash
npx dbpia-mcp@latest
```

### Browser Setup (for PDF download)

Option 1: Use existing Chrome (recommended)
```jsonc
{
  "environment": {
    "DBPIA_USE_EXISTING_CHROME": "true",
    "DBPIA_CHROME_PROFILE": "Default"
  }
}
```

Option 2: Install Playwright Chromium
```bash
npx playwright install chromium
```

## API Key

1. [DBpia Open API Portal](https://api.dbpia.co.kr/openApi/index.do)
2. Register and get API key from [Key Management](https://api.dbpia.co.kr/openApi/key/keyManage.do)

## OpenCode Setup

```jsonc
{
  "mcp": {
    "dbpia": {
      "type": "local",
      "command": ["npx", "dbpia-mcp@latest"],
      "environment": {
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
| `dbpia_search_advanced` | Advanced search (author, journal) |
| `dbpia_top_papers` | Popular papers |
| `dbpia_local_search` | Search local cache |
| `dbpia_export` | Export to JSONL |
| `dbpia_login` | Login for PDF download |
| `dbpia_logout` | Logout |
| `dbpia_login_status` | Check login status |
| `dbpia_download` | Download PDF (requires login) |
| `dbpia_cite` | Generate citation (Chicago default) |
| `dbpia_fulltext_index` | Index PDF content (OCR supported) |
| `dbpia_fulltext_search` | Search indexed content |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DBPIA_API_KEY` | API key (required) | - |
| `DBPIA_DB_PATH` | SQLite storage path | `~/.dbpia-mcp` |
| `DBPIA_BUSINESS_API_KEY` | Business API key (for detail) | - |
| `DBPIA_USE_EXISTING_CHROME` | Use existing Chrome browser | `false` |
| `DBPIA_CHROME_PROFILE` | Chrome profile name | `Default` |
| `DBPIA_DOWNLOAD_DIR` | PDF download directory | `~/.dbpia-mcp/downloads` |

## Citation Styles

Default: **Chicago**

```
dbpia_cite(articleId: "NODE123", style: "chicago")
dbpia_cite(articleId: "NODE123", style: "apa")
dbpia_cite(articleId: "NODE123", style: "bibtex")
```

## OCR Integration

Use your own OCR CLI for scanned PDFs:

```
dbpia_fulltext_index(
  articleId: "NODE123",
  pdfPath: "/path/to/paper.pdf",
  ocrCommand: "your-ocr-cli {input} -o {output}"
)
```

## License

MIT
