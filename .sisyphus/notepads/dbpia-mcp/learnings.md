### fast-xml-parser Patterns (2026-02-03)
- Use `isArray: (name) => [...]` to force certain tags into arrays, preventing "single node as object, multiple as array" inconsistency.
- `ignoreAttributes: false` and `attributeNamePrefix: '@_'` allow capturing metadata like item IDs if they appear in attributes (though DBpia usually uses tags).
- `parseTagValue: true` ensures numbers/booleans are parsed correctly.

### Normalization Patterns
- DBpia authors often come as `<authors><author>Name</author></authors>`.
- Empty authors/keywords should be normalized to `[]`.
- Abstract can be null/undefined, normalized to `null` if missing.
- Stable ID generation using `crypto.createHash('sha256')` provides a reliable way to deduplicate items without a native ID.
