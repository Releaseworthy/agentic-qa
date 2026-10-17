# agentic-qa

[![QA pipeline](https://github.com/hoanglan9569/agentic-qa/actions/workflows/ci.yml/badge.svg)](https://github.com/hoanglan9569/agentic-qa/actions/workflows/ci.yml)
[![QA report](https://img.shields.io/badge/QA_report-GitHub_Pages-2ea44f)](https://hoanglan9569.github.io/agentic-qa/)

A set of AI agents that handle the QA work on a project from start to finish. They plan from risk, refine acceptance
criteria, write and run API and UI tests, explore the app, verify and retest bugs, run impact-based regression and
make the Go/No-Go call. They work from a Hybrid RAG knowledge base and a real Playwright framework, and their output
is checked by deterministic engines and by human review.

The app under test is **ShopLite**, a small shop with a REST API and a web UI that lives in this repo. It has
switchable **seeded defects**, so you can actually check whether the agents and the tests catch bugs. Everything runs
locally and in CI, with no external system.

**Stack:** Claude Agent SDK · Claude Code skills and subagents · MCP · Playwright + TypeScript on Bun ·
ChromaDB + Neo4j (Hybrid RAG, Python/uv) · LangSmith · ripgrep · GitHub Actions · Azure Pipelines

## Proof

| Claim                            | Evidence                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The agents do real QA work       | Headless runs: `refine-ac` → 13 questions for Product and 8 testable criteria ($1.17); `adhoc-test` → all 4 planted defects found ($0.77); `learn` → lessons through gate and judge ($0.53, $0.68). [Runs](docs/agents.md#real-runs) |
| The suite catches bugs           | Every seeded defect turns a test tagged with its rule from green to red: [4 of 4](docs/examples/defect-detection.md), checked on every push                                                                                          |
| Tests are independent            | 112 API + Chromium tests (164 runs with Firefox and WebKit), fully parallel, each on data of its own                                                                                                                                 |
| Releases are decided on evidence | Go/No-Go, traceability and the defect board, published to [GitHub Pages](https://hoanglan9569.github.io/agentic-qa/) on every push to `main`                                                                                         |
| Retrieval quality is measured    | Vector vs graph vs hybrid on tuning, dev and held-out questions. On the 59 held-out ones, hybrid is one question ahead of vector. [Eval](docs/knowledge.md#evaluation)                                                               |
| Agent output is checked          | A heal guard blocks weakened tests, a knowledge guard blocks uncurated vault edits, one tool policy covers every session. [How](docs/agents.md#tool-policy)                                                                          |

## Quick start

Prerequisites: [Bun](https://bun.sh) 1.4+ and [uv](https://docs.astral.sh/uv/). Everything else installs into the repo.

```powershell
$env:STRING_HEX_SHOPLITE = 'b4a8856ed96c7f3dbf79c4cd155bb59f59877615922a041842d5a321009898aa'
bun run setup            # packages, browsers, Python env, RAG index
bun run test             # API + Chromium on dev: 112 tests, starts ShopLite itself
bun run app              # ShopLite on http://localhost:3100 (SHOPLITE_DEFECTS=all for the buggy build)
```

On bash: `export STRING_HEX_SHOPLITE=b4a8856ed96c7f3dbf79c4cd155bb59f59877615922a041842d5a321009898aa`.

> **About `STRING_HEX_SHOPLITE`:** the saved test accounts in `env/` are committed only as encrypted `enc1.…`
> tokens, and this key decrypts them. It is public because the accounts belong to a demo shop on your machine; a
> real project keeps it in a secret store, as CI does.

Agents need Claude credentials: a Claude Code login locally, or `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` in CI.
Open the repo in Claude Code and type `/refine-ac CARD-142`, or run it headless: `bun run agent refine-ac CARD-142`.

## What the agents do

| Area              | Workflows                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Plan              | `qa-plan` risk-based test plan · `refine-ac` acceptance criteria                                             |
| Manual testing    | `write-testcases` test design · `run-testcases` scripted execution · `automate-tc` manual → Playwright       |
| Automated testing | `api-testgen` endpoints · `api-journey-testgen` journeys · `ui-qa` explore + automate · `adhoc-test` charter |
| Bugs              | `verify-bug` · `bug-triage` · `retest-bug`                                                                   |
| Maintenance       | `regression` impact-based · `flaky-hunt` · `heal-tests` verdict first                                        |
| Release           | `smoke-check` · `test-report` · `release-gate`                                                               |
| Self-improvement  | a reflection that ends every run · `learn` from review comments and human edits                              |

Each workflow's inputs, outputs and the engines behind it: [docs/agents.md](docs/agents.md#workflows).

## How it works

```mermaid
flowchart LR
  subgraph Agents["Claude Agent SDK / Claude Code"]
    O["Skill orchestrator<br/>(opus)"] --> KS["knowledge-scout<br/>(haiku)"]
    O --> CS["code-scout<br/>(haiku)"]
    O --> UX["ui-explorer ×N<br/>(haiku, own browser each)"]
    O --> TA["test-author<br/>(opus)"]
    O --> TR["test-reviewer<br/>(opus)"]
    O --> QW["qa-writer<br/>(sonnet)"]
    O --> MT["manual-tester ×N<br/>(haiku, own browser each)"]
    O --> KC["knowledge-curator<br/>(sonnet, independent judge)"]
  end
  KS -->|MCP| RAG["knowledge MCP<br/>ChromaDB + Neo4j graph"]
  CS -->|MCP| CODE["codesearch MCP<br/>ripgrep + import graph"]
  UX -->|playwright-cli| APP["ShopLite<br/>(system under test)"]
  MT -->|playwright-cli| APP
  TA --> FW["Playwright framework<br/>API helpers · seed · recipes · page objects"]
  UX -->|qa:arrange| FW
  MT -->|qa:arrange| FW
  FW --> APP
  O --> ENG["QA engines<br/>impact · traceability · gate · triage · manual runs · flakiness · guards"]
  QW -->|test cases, defects| RAG
  O -->|propose_knowledge| GATE["knowledge gate<br/>evidence · novelty · retrieval regression"]
  KC -->|commit_knowledge| GATE
  GATE -->|accepted| RAG
```

| Part                             | In short                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Agents](docs/agents.md)         | Skills orchestrate subagents on the right model; one tool policy for every session; a headless runner            |
| [Knowledge](docs/knowledge.md)   | A Markdown vault → ChromaDB + Neo4j over MCP; lessons gated, judged by another agent, ledgered                   |
| [Framework](docs/framework.md)   | Playwright + TypeScript: API helpers, zod contracts, page objects, recipes, environments, saved accounts         |
| [QA engines](docs/qa-engines.md) | Impact, traceability, release gate, defect detection, triage, manual runs, flakiness, guards, plus every command |
| [CI/CD](docs/ci.md)              | The QA pipeline, the agentic workflow (agent job + publish job), Azure Pipelines                                 |

## Project structure

```
├─ app/                 ShopLite: REST API (domain/, routes/), SPA (web/), seeded defects (defects.ts)
├─ env/                 .env.dev · .env.staging · .env.live: per-environment settings, encrypted accounts
├─ framework/           api/ (helpers + zod schemas) · auth/ (accounts, storage states) · config/ (env, paths,
│                       timeouts) · data/ · pages/ · setup/ (seed, recipes + qa:arrange CLI, catalog, app launcher) ·
│                       utils/ (date, step, crypto) · fixtures
├─ tests/               api/endpoints · api/journeys · ui · unit (QA engines) · rag (knowledge server and gate, pytest)
├─ knowledge/           vault: product, features, rules, cards, defects, test-cases, learnings, setup (generated) ·
│                       _curation/ (decision ledger, proposals waiting for a human)
├─ rag/                 Hybrid RAG (Python/uv): vault loader, ChromaDB, graph (local/Neo4j), fusion, MCP server,
│                       eval (golden, dev, held-out, learned probes), knowledge gate (curate.py), Dockerfile
├─ codesearch/          ripgrep + import/symbol graph, CLI and MCP server
├─ qa/                  impact · traceability · release gate · seeded-defect detection · defect triage · manual runs ·
│                       flakiness · heal guard · knowledge guard · vault check · PR feedback (members only)
├─ agents/              Claude Agent SDK runner, workflow registry, tool policy (+ its PreToolUse hook)
├─ .claude/             skills/ (19 workflows) · agents/ (8 subagents) · rules/ · settings.json
├─ docs/                agents · knowledge · framework · qa-engines · ci · examples/ (outputs of real runs)
├─ scripts/             crypto CLI (encrypt / decrypt / keygen), GitHub Pages landing page
├─ .github/             CI workflows, setup action
├─ .azure/              setup step template for the Azure pipeline
├─ azure-pipelines.yml  Azure DevOps pipeline
├─ docker-compose.yml   knowledge MCP + Neo4j
├─ .mcp.json            knowledge + codesearch MCP servers for Claude Code
├─ CLAUDE.md            rules every agent follows
└─ playwright.config.ts projects api · chromium · firefox · webkit; starts ShopLite
```

Generated and gitignored: `out/` (reports, plans, agent runs, manual runs, bug evidence), `.auth/` (storage states),
`.rag/` (index), Playwright output.

## License

[MIT](LICENSE) © Lan Hoang
