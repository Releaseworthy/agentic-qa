---
name: adhoc-test
description: On-demand, unscripted exploratory check of the live app — takes a charter in plain words, grounds expectations in the vault, seeds the start state with the setup helpers, investigates with playwright-cli (and the API when faster), captures evidence and reports defects. No tests are written. Invoke as /adhoc-test "<charter>" [--defects].
argument-hint: "\"<charter>\" [--defects]"
---

# Ad hoc testing

Read `.claude/rules/orchestration.md` and `.claude/rules/browser.md` first.

1. **Charter**: restate it as a mission (area, risk, what would count as a bug) in one line.
   `--defects` → a practice run against the seeded-defect build: the first `seed:session` command gets `--defects all`, and the last command of the run is `bun run seed:session --name reset --defects none`. Findings there are bugs planted on purpose: they go in the session notes only, never in `knowledge/defects/`.
2. **Expectations** with `knowledge-scout`: the rules, boundaries and messages the charter touches.
3. **Investigate** with `ui-explorer` (one session, or two in parallel for independent angles, each with its own session name), passing the charter, the expectations with DOC-ids, and the `seed:session` command for its start state. Tell it to vary inputs around every boundary, repeat actions, reload mid-flow, and check the API answer behind every screen state.
4. **Confirm** each suspected defect with one direct API call — a scratch script `out/adhoc/<slug>-repro.ts` run with `bun run` — so the report has a minimal reproduction.
5. **Report**: write the session notes to `out/adhoc/<date>-<slug>.md`: charter, start states, what was tried, findings (expected with DOC-id vs actual, evidence, repro), questions, ideas for automated tests. Outside `--defects`, each confirmed defect also goes to `qa-writer` as a `DEF-…` document (`status: confirmed`, see `.claude/rules/bug-lifecycle.md`).
6. **Reflect: `.claude/rules/self-improve.md`.**

Final response: the notes path, defects (one line each: rule broken, severity, evidence), questions, and which findings deserve an automated test.
