---
id: LRN-NEVER-WRITE-TYPESCRIPT-THROUGH-DOUBLE-QU
type: learning
title: Never write TypeScript through double-quoted PowerShell strings
status: active
confidence: established
support: 1
applies_to: ['**/*.ts']
sources: [Human review feedback 2026-10-17]
evidence: ['human: Review feedback 2026-10-17 (/learn)', 'code: commit 3cfb7e8 (framework/fixtures.ts, agents/run.ts)']
created: '2026-10-17'
updated: '2026-10-17'
---

# Never write TypeScript through double-quoted PowerShell strings

- **What:** on Windows, create or change `.ts` files only with the Write/Edit tools or a single-quoted here-string (`@'…'@`). Never pass source text through a double-quoted PowerShell string (`"…"`, `@"…"@`, `Set-Content "…"`, `-replace "…"`).
- **Why:** in double-quoted PowerShell strings the backtick is the escape character: `` `b `` becomes a backspace (0x08), `` `a `` a bell (0x07), `` `n `` a newline, `` `t `` a tab. TypeScript template literals and Markdown/JSDoc code spans use backticks, so the file silently gets control characters. It happened twice here (`framework/fixtures.ts` JSDoc, `agents/run.ts`; fixed in commit 3cfb7e8).
- **Check before committing:** scan staged files for control characters other than tab/LF/CR, e.g. `git diff --cached --name-only | xargs grep -lP '[\x00-\x08\x0B\x0C\x0E-\x1F]'` (Bash, UTF-8 locale) or `Select-String -Pattern '[\x00-\x08\x0B\x0C\x0E-\x1F]'` over the staged paths. Any hit means the file is corrupted; rewrite the line with Edit.
