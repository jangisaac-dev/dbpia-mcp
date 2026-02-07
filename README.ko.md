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
- **PDF 전문 인덱싱**: 로컬/외부 OCR 제공자(Provider)로 PDF 텍스트 추출 및 색인

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
| `DBPIA_OCR_CMD_OWLOCR` | OwlOCR용 커맨드 템플릿 | - |
| `DBPIA_OCR_CMD_TESSERACT` | Tesseract용 커맨드 템플릿 | - |
| `DBPIA_OCR_CMD_PDFTOTEXT` | pdftotext용 커맨드 템플릿 | - |
| `DBPIA_OCR_CMD_PADDLEOCR` | PaddleOCR용 커맨드 템플릿 | - |
| `DBPIA_OCR_CMD_EASYOCR` | EasyOCR용 커맨드 템플릿 | - |
| `DBPIA_OCR_CMD_GOOGLE_VISION` | Google Vision용 커맨드 템플릿 | - |
| `DBPIA_OCR_CMD_AZURE_READ` | Azure Read용 커맨드 템플릿 | - |
| `DBPIA_OCR_CMD_AWS_TEXTRACT` | AWS Textract용 커맨드 템플릿 | - |
| `DBPIA_OCR_CMD_OCR_SPACE` | OCR.Space용 커맨드 템플릿 | - |

### OpenCode 설정 (opencode.json)

OpenCode는 MCP 서버를 `mcpServers`가 아니라 `mcp` 아래에 설정합니다.

또한 OpenCode는 별도의 `args` 필드를 쓰지 않습니다. 실행 파일과 인자를 `command` **배열**에 그대로 넣습니다.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dbpia": {
      "type": "local",
      "command": ["npx", "-y", "dbpia-mcp@latest"],
      "enabled": true,
      "environment": {
        "DBPIA_API_KEY": "여기에_API_키_입력"
      }
    }
  }
}
```

### Claude Code 설정 (.mcp.json)

Claude Code는 MCP 설정 파일을 별도로 사용합니다. **프로젝트 단위(공유) 설정**은 프로젝트 루트의 `.mcp.json`에 추가합니다. (Claude Code MCP 문서 참고)

**옵션 A: JSON으로 직접 설정**

```json
{
  "mcpServers": {
    "dbpia": {
      "command": "npx",
      "args": ["-y", "dbpia-mcp@latest"],
      "env": {
        "DBPIA_API_KEY": "여기에_API_키_입력"
      }
    }
  }
}
```

**옵션 B: Claude Code CLI로 설정**

```bash
claude mcp add --transport stdio --env DBPIA_API_KEY=여기에_API_키_입력 dbpia \
  -- npx -y dbpia-mcp@latest
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

### 전문 검색 & OCR

| 도구 | 설명 | 주요 인자 |
|------|------|-----------|
| `dbpia_fulltext_index` | PDF OCR/텍스트 추출 후 전문 인덱싱 | `articleId` (필수), `pdfPath`, `provider`, `fallbackProviders`, `languages`, `pages`, `dpi`, `timeoutMs`, `commandTemplate`, `providerCommands` |
| `dbpia_fulltext_search` | 인덱싱된 전문 검색 | `query` (필수), `limit` |

#### OCR Provider (OwlOCR 외 지원)

다음과 같이 로컬/외부 OCR을 선택할 수 있습니다.

- 로컬: `tesseract`, `pdftotext`, `paddleocr`, `easyocr`
- 외부/관리형: `google-vision`, `azure-read`, `aws-textract`, `ocr-space`
- `auto`: 기본 폴백 체인(`owlocr -> tesseract -> pdftotext`) 사용

Provider별 커맨드는 환경변수 또는 `providerCommands` 인자로 지정 가능합니다.

템플릿 플레이스홀더:
- `{input}` PDF 경로
- `{output}` 출력 텍스트 파일 경로
- `{langs}` 언어 문자열 (예: `kor+eng`)
- `{dpi}` DPI
- `{pages}` 페이지 선택 값

예시:

```bash
export DBPIA_OCR_CMD_TESSERACT='tesseract "{input}" stdout -l {langs} --oem 1 --psm 6'
export DBPIA_OCR_CMD_PDFTOTEXT='pdftotext "{input}" -'
```

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
