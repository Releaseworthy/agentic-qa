# learn: a near-duplicate becomes an update of the lesson it repeats

`bun run agent learn "<review feedback>" --budget 3` · 12 turns · **$0.68** · 3.2 min · 2026-10-17

**Input (human feedback, second review):** generated tests that exposed a product bug were pinned with
`test.fail(true, 'PRODUCT_BUG: …')`, which the heal guard refuses, so a headless `api-testgen` run that finds a bug
has its patch blocked. The order that works: report `PRODUCT_BUG`, `qa-writer` files the defect, then pin the test
with its `DEF-…` id. Fixed in d2789de.

| Step                | What happened                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Duplicates first    | `search_knowledge(scope="learnings")`; evidence checked with `git show d2789de` and `qa/heal-guard.ts` |
| `propose_knowledge` | a new learning, **rejected by the gate**: novelty 0.668 against `LRN-SCOPE` (≥ 0.65 must be an update) |
| Re-proposed         | `kind: update` of `LRN-SCOPE`, the pinning rule merged into it; gate passed, golden MRR 0.864 → 0.864  |
| `knowledge-curator` | independent judge (sonnet) read the cited code and accepted it                                          |
| `commit_knowledge`  | `LRN-SCOPE` rewritten, `support: 2` (a second, human source), its probe added to `rag/golden.learned.yaml` |
| Loop closed         | `rag:eval` passes; `qa:knowledge-guard` matches the file to its ledger line (sha `7c6777949d56`)        |

In this run the gate stopped the vault from getting two lessons on the same topic, and the agent followed the gate's
instruction and re-proposed the lesson as an update. The knowledge guard, which runs outside the agent, confirmed that
the file in the patch is the one the judge accepted. The tool policy held for the whole run: the one refused command was Claude Code's own
don't-ask mode declining a `${PIPESTATUS[0]}` expansion.
