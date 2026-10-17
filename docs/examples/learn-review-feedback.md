# learn: review feedback becomes a gated, judged lesson

`bun run agent learn "<review feedback>" --budget 3` · 9 turns · **$0.53** · 1.3 min · 2026-10-17

**Input (human feedback):** twice in this repo, TypeScript files got literal control characters because they were
edited through double-quoted PowerShell strings, where a backtick escapes the next letter. Fixed in 3cfb7e8.

| Step                  | What happened                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Duplicates first      | `search_knowledge(scope="learnings")`: nothing on the topic (closest, LRN-SCOPE, 0.174 cosine)      |
| Evidence              | `git show 3cfb7e8`, checked the fixed files for control characters                                |
| `propose_knowledge`   | gate passed: shape, evidence, links, scope (`**/*.ts`), ownership, novelty, retrieval              |
| Retrieval what-if     | golden MRR unchanged (0.859); the probe ranks the new lesson **first**                              |
| `knowledge-curator`   | independent judge (sonnet): grounded 4 · reusable 4 · actionable 5 · scoped 4 · consistent 5      |
| `commit_knowledge`    | accepted → `knowledge/learnings/LRN-NEVER-WRITE-TYPESCRIPT-THROUGH-DOUBLE-QU.md`, `confidence: established` (human evidence) |
| Loop closed           | probe added to `rag/golden.learned.yaml`; `rag:eval` 27 questions, hybrid MRR 0.864                |

The ledger line is the first entry of `knowledge/_curation/ledger.jsonl` (`PROP-20261017-ea3c21`).

**What the run found about the tooling:** the renderer printed the lesson's H1 twice (the body opened with its own
title), and the generated id was cut mid-word. Both were fixed in `rag/curate.py` with tests. The duplicate heading
in this one file was removed by hand; its id stays as committed, since the ledger and the learned probe reference it.
