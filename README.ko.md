# dbpia-mcp

[![npm version](https://img.shields.io/npm/v/dbpia-mcp.svg)](https://www.npmjs.com/package/dbpia-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md) | 한국어

[DBpia](https://www.dbpia.co.kr) - 국내 최대 학술논문 데이터베이스를 위한 MCP 서버입니다.

## 기능

- **검색**: 키워드 검색 및 고급 검색 (저자, 출판사, 학술지)
- **인기 논문**: 연도/월별 인기 논문 조회
- **인용문 생성**: Chicago, APA, MLA, BibTeX, Harvard, Vancouver 스타일 지원
- **브라우저에서 열기**: 논문 페이지를 기본 브라우저에서 바로 열기
- **전문 검색**: PDF 색인 및 내용 검색 (OCR CLI 지원)
- **로컬 캐시**: SQLite 저장소로 오프라인 접근 및 내보내기

## 설치

```bash
npx dbpia-mcp@latest
```

## API 키 발급

1. [DBpia Open API 포털](https://api.dbpia.co.kr/openApi/index.do) 방문
2. [키 관리](https://api.dbpia.co.kr/openApi/key/keyManage.do)에서 API 키 발급

## 설정 (OpenCode / Claude Desktop)

```jsonc
{
  "mcpServers": {
    "dbpia": {
      "command": "npx",
      "args": ["dbpia-mcp@latest"],
      "env": {
        "DBPIA_API_KEY": "발급받은_API_키"
      }
    }
  }
}
```

## 도구 목록

| 도구 | 설명 |
|------|------|
| `dbpia_search` | 키워드 검색 |
| `dbpia_search_advanced` | 고급 검색 (저자, 출판사, 학술지) |
| `dbpia_top_papers` | 연도/월별 인기 논문 |
| `dbpia_local_search` | 로컬 캐시 검색 |
| `dbpia_export` | 캐시된 논문 JSONL 내보내기 |
| `dbpia_open` | 논문 페이지 브라우저에서 열기 |
| `dbpia_cite` | 인용문 생성 (Chicago 기본) |
| `dbpia_fulltext_index` | PDF 전문 색인 (OCR 지원) |
| `dbpia_fulltext_search` | 전문 검색 |

## 사용 예시

### 논문 검색
```
dbpia_search(searchall: "인공지능", pagecount: 10)
```

### 브라우저에서 열기
```
dbpia_open(articleId: "NODE12345678")
```

### 인용문 생성
```
dbpia_cite(articleId: "NODE12345678", style: "apa")
```

지원 스타일: `chicago` (기본), `apa`, `mla`, `bibtex`, `harvard`, `vancouver`

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `DBPIA_API_KEY` | API 키 (필수) | - |
| `DBPIA_DB_PATH` | SQLite 저장 경로 | `~/.dbpia-mcp` |
| `DBPIA_BUSINESS_API_KEY` | 비즈니스 API 키 (상세정보용) | - |

## OCR 연동

스캔된 PDF를 OCR CLI로 색인:

```
dbpia_fulltext_index(
  articleId: "NODE123",
  pdfPath: "/path/to/paper.pdf",
  ocrCommand: "ocrmypdf {input} - | pdftotext - {output}"
)
```

## 라이선스

MIT
