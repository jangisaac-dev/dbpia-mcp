# Decisions - 2026-02-03
- Use internal migration runner with embedded SQL strings for simplicity in MVP.
- Schema: 
  - schema_version: tracks migration version.
  - articles: stores article metadata and raw JSON.
  - query_cache: stores tool call results with expiration.
- DB path: Always treat DBPIA_DB_PATH as a directory and append 'dbpia.sqlite'.
