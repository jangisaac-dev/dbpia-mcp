# dbpia-mcp

[![npm version](https://img.shields.io/npm/v/dbpia-mcp.svg)](https://www.npmjs.com/package/dbpia-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md) | 한국어

[DBpia](https://www.dbpia.co.kr) - 국내 최대 학술논문 데이터베이스를 위한 MCP 서버입니다.

이 서버를 통해 LLM이 학술 논문을 검색하고, 인용문을 생성하며, 결과를 로컬에 캐싱하고, PDF 전문을 색인하여 검색할 수 있습니다.

## 주요 기능

- **검색**: 키워드 검색 및 고급 검색 (저자, 출판사, 학술지 등)
- **인기 논문**: 연도/월별, 카테고리별 인기 논문 조회
- **인용문 생성**: Chicago, APA, MLA, BibTeX, Harvard, Vancouver 등 다양한 스타일 지원
- **브라우저에서 열기**: 논문 상세 페이지를 기본 브라우저에서 바로 열기
- **로컬 캐시**: SQLite 기반 저장소 지원 (기본 7일 캐시), 오프라인 접근 가능
- **내보내기**: 캐시된 데이터를 JSONL 형식으로 내보내기

## 설치

```bash
npx dbpia-mcp@latest
```

## API 키 발급

1. [DBpia Open API 포털](https://api.dbpia.co.kr/openApi/index.do) 방문
2. 회원가입 후 [키 관리](https://api.dbpia.co.kr/openApi/key/keyManage.do) 메뉴에서 API 키 발급

## 설정

### 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `DBPIA_API_KEY` | **필수**. 발급받은 Open API 키 | - |
| `DBPIA_BUSINESS_API_KEY` | 선택. `dbpia_detail` 도구 사용 시 필요 | - |
| `DBPIA_DB_PATH` | SQLite 데이터베이스 저장 경로 | `~/.dbpia-mcp` |
| `DBPIA_DEBUG` | 상세 로그 출력 활성화 | `false` |
| `DBPIA_QUERY_TTL_DAYS` | 검색 결과 캐시 유지 기간 (일) | `7` |

### OpenCode / Claude Desktop 설정

설정 파일(`opencode.json` 또는 `claude_desktop_config.json`)에 아래 내용을 추가하세요:

```json
{
  "mcpServers": {
    "dbpia": {
      "command": "npx",
      "args": ["dbpia-mcp@latest"],
      "env": {
        "DBPIA_API_KEY": "여기에_API_키_입력"
      }
    }
  }
}
```

## 도구 목록

### 검색 및 탐색

| 도구 | 설명 | 주요 인자 |
|------|------|-----------|
| `dbpia_search` | 단순 키워드 검색 | `searchall` (필수), `page`, `pagecount` |
| `dbpia_search_advanced` | 필드별 상세 검색 | `searchauthor`, `searchpublisher`, `searchbook` 등 |
| `dbpia_top_papers` | 인기/추천 논문 조회 | `pyear`, `pmonth`, `category` |
| `dbpia_local_search` | 로컬 캐시 검색 | `query` (필수), `remoteFallback` (원격 검색 폴백) |

### 유틸리티

| 도구 | 설명 | 주요 인자 |
|------|------|-----------|
| `dbpia_open` | 논문 페이지 브라우저 열기 | `articleId` (필수) |
| `dbpia_cite` | 인용문 생성 | `articleId` (필수), `style` (chicago, apa 등) |
| `dbpia_export` | 캐시 데이터 내보내기 | `outputPath` (필수) |
| `dbpia_detail` | 논문 상세 메타데이터 | `id` (필수) - *Business API Key 필요* |

## 사용 예시

### 1. 논문 검색
**사용자 질문:**
> "2024년에 발행된 인공지능 관련 논문 찾아줘"

**도구 호출:**
```javascript
dbpia_search(searchall: "인공지능", pyear: "2024")
```

### 2. 인용문 생성
**사용자 질문:**
> "첫 번째 논문의 APA 스타일 인용문을 만들어줘"

**도구 호출:**
```javascript
dbpia_cite(articleId: "NODE12345678", style: "apa")
```

### 3. 브라우저에서 열기
**사용자 질문:**
> "이 논문 상세 페이지 열어줘"

**도구 호출:**
```javascript
dbpia_open(articleId: "NODE12345678")
```

## 라이선스

MIT
