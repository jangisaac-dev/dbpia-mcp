# dbpia-mcp

DBpia 논문 검색 MCP 서버

## API 키 발급

1. [DBpia Open API 포털](https://api.dbpia.co.kr/openApi/index.do) 접속
2. 회원가입/로그인
3. [키 등록관리](https://api.dbpia.co.kr/openApi/key/keyManage.do)에서 API 키 발급

## OpenCode 설정

`opencode.jsonc`에 추가:

```jsonc
{
  "mcp": {
    "dbpia": {
      "type": "local",
      "command": ["npx", "dbpia-mcp@latest"],
      "environment": {
        "DBPIA_API_KEY": "발급받은_키"
      }
    }
  }
}
```

**끝!**

## 제공 도구

| 도구 | 설명 |
|------|------|
| `dbpia_search` | 키워드 논문 검색 |
| `dbpia_search_advanced` | 고급 검색 (저자, 학술지 등) |
| `dbpia_top_papers` | 인기 논문 조회 |
| `dbpia_local_search` | 로컬 캐시 검색 |
| `dbpia_export` | 검색 결과 내보내기 |

## 환경변수 (선택)

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `DBPIA_API_KEY` | API 키 (필수) | - |
| `DBPIA_DB_PATH` | DB 저장 경로 | 프로젝트 폴더 |
| `DBPIA_BUSINESS_API_KEY` | 비즈니스 API 키 | - |

## 라이선스

MIT
