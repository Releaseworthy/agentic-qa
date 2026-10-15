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

| Folder        | `type`      | What                                                                |
| ------------- | ----------- | ------------------------------------------------------------------- |
| `product/`    | `overview`  | What ShopLite is, who uses it, glossary                             |
| `features/`   | `feature`   | One card per shipped feature: code, endpoints, pages, rules, risk   |
| `rules/`      | `rule`      | One business rule each: statement, boundaries, error contract      |
| `cards/`      | `card`      | Work items not built yet — input to AC refinement and test planning |
| `defects/`    | `defect`    | Known defects with status and severity — input to the release gate  |
| `test-cases/` | `test-case` | Manual test cases written by the UI QA workflow                     |
| `learnings/`  | `learning`  | Lessons from human review, fed back by the `learn` workflow         |

Write through the `knowledge` MCP (`add_learning`, `upsert_document`) so the
index stays in sync; a hand edit is picked up by `bun run rag:build`.
