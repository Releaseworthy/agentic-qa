---
id: VAULT
type: index
title: Knowledge vault
---

# Knowledge vault

Business knowledge the agents ground in, as Obsidian-style Markdown: YAML
frontmatter for structure, `[[ID]]` links for the graph. Indexed by `rag/`
into ChromaDB (vector) and a knowledge graph (Neo4j or local), and served
over MCP (`knowledge` server).

| Folder        | `type`      | What                                                                | Owner · how it changes                         |
| ------------- | ----------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| `product/`    | `overview`  | What ShopLite is, who uses it, glossary                             | Product · proposal → human                     |
| `features/`   | `feature`   | One card per shipped feature: code, endpoints, pages, rules, risk   | Product; agents may fix `code`/`endpoints`/`pages` |
| `rules/`      | `rule`      | One business rule each: statement, boundaries, error contract      | Product · proposal → human                     |
| `cards/`      | `card`      | Work items not built yet — input to AC refinement and test planning | Product · proposal → human                     |
| `defects/`    | `defect`    | Defects with lifecycle, severity, priority — input to the gate      | QA · `upsert_document`, reviewed               |
| `test-cases/` | `test-case` | The manual test suite: steps with exact labels and expected results | QA · `upsert_document`, reviewed               |
| `learnings/`  | `learning`  | How to work here: conventions, pitfalls, tool quirks               | Agents · proposal → gate → judge               |
| `setup/`      | `setup`     | `SETUP-RECIPES`: how to arrange any precondition and its test data with the framework | Code · generated from `framework/setup/recipes.ts` (`bun run qa:arrange --catalog`) |
| `_curation/`  | —           | `ledger.jsonl` (every knowledge decision) · `proposals/` (waiting for a human) | not indexed                    |

## Lifecycles

- **Defect** `status`: `new` → `confirmed` → `fixed` → `closed`, or `reopened` when the retest fails;
  `rejected` with a `resolution` (`not-a-bug`, `duplicate`, `cannot-reproduce`, `wont-fix`). Anything not
  closed or rejected counts as open for the release gate. Each change adds a line under `## History`.
- **Test case** `status`: `draft` (written from rules, not yet walked) → `ready` (walked in the app) →
  `outdated` (the app changed in a documented way; the case waits for its update) → `deprecated` (retired: kept as
  history, never run, counted or retrieved). `automated_by` names the spec › title, or `none`. `setup` names the
  recipe that arranges its preconditions (`bun run qa:arrange --case <id>`); `bun run qa:arrange --check` fails CI on
  a missing or invalid one.
- **Learning** `confidence`: `provisional` (an agent saw it once) → `established` (human evidence, or a
  second independent source — `support` counts them). `status: deprecated` keeps it as history, unretrieved.

## Self-improvement

Every workflow ends with a reflection (`.claude/rules/self-improve.md`). A lesson worth keeping becomes a
proposal: `propose_knowledge` runs a deterministic gate — shape, evidence, links, scope, ownership,
novelty (no near-duplicate) and retrieval (the golden set must not regress on a throwaway index, and the
proposal's probe question must find it) — then the `knowledge-curator` agent, which did not write it,
scores it on five criteria, and `commit_knowledge` applies the result. Accepted probes join
`rag/golden.learned.yaml`, so learned knowledge stays findable. `bun run kb:audit` lists stale,
unconfirmed and duplicate learnings for `/learn --audit`.

A hand edit is picked up by `bun run rag:build`.
