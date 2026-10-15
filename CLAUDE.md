# agentic-qa — rules for every agent

Applies to every session, skill and subagent in this repo. Say each thing once.

- **English, terse.** No filler in code, comments, reports or vault entries.
- **Bun** for TypeScript (`bun run`, `bunx`, `bun test`); **uv** only for `rag/` (`uv run python -m rag.…`). Never npm/npx/pip.
- **Layers** — put each change in the closest one:
  - `app/` — ShopLite, the system under test. Never edit it to make a test pass. A product bug is reported, not hidden.
  - `framework/` — API helpers (`api/`), accounts and storage states (`auth/`), env and timeouts (`config/`), test data (`setup/seed.ts`), page objects (`pages/`), dates / steps / crypto (`utils/`), fixtures. Reuse before adding.
  - `tests/api/endpoints`, `tests/api/journeys`, `tests/ui` — specs. `tests/unit` — QA-engine unit tests.
  - `knowledge/` — the vault. Write only through the `knowledge` MCP (`upsert_document`, `add_learning`) so the index stays in sync.
  - `qa/` — deterministic engines: impact, traceability, release gate, defect detection. Agents call them; they don't reimplement them.
- **Ground before acting.** Behaviour comes from the `knowledge` MCP (`search_knowledge` with a `scope`, then `get_document`), never from guessing. Existing code comes from the `codesearch` MCP (`list_helpers`, `search_code`, `find_symbol`) before anything new is written.
- **Tests** follow `.claude/rules/test-authoring.md`. Browsers follow `.claude/rules/browser.md`. Skills that delegate follow `.claude/rules/orchestration.md`.
- **Run tests** with `bunx playwright test --project=<api|chromium> --grep "<regex>"` — one command for every target, `--workers=4`. `TEST_ENV=dev|staging|live` (default `dev`) picks `env/.env.<name>`; the app starts with the run. `STRING_HEX_SHOPLITE` must be set (it decrypts the saved accounts). Unit tests: `bun test tests/unit`.
- **Credentials** never appear in plaintext — env files hold `enc1.…` tokens from `bun run crypto encrypt`.
- **Never fix a failure by raising a timeout, weakening an assertion, or skipping.** Find the missing wait or the real cause.
- **Known product bugs stay visible:** a `knowledge/defects/DEF-*.md` document plus a `test.fail()` test titled with the defect id.
- **Scratch** (plans, reports, screenshots, transcripts) goes in `out/` — gitignored. Never anywhere else.
