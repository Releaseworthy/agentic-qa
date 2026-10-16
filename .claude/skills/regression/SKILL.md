---
name: regression
description: Impact-based regression — selects the tests a change can break (change-impact analysis over code, rules and the import graph), runs them in parallel, and triages every failure into flaky, test defect (fixed) or product bug (reported), then hands the results to the release gate. Invoke as /regression [--base <ref> | --full].
argument-hint: "[--base <ref> | --full]"
---

# Impact-based regression

Read `.claude/rules/orchestration.md` first.

1. **Select**: `--full` → everything; otherwise `bun run qa:impact --quiet [--base <ref>]` and read `out/impact.json`. `full: true` → everything; `selected: 0` → report "no test impact" and stop. Unmapped files → list them (a feature card needs `code:` for them).
2. **Run**: `bunx playwright test --project=api --project=chromium --grep "<grep>" --workers=4 --retries=1` (no `--grep` for full). Results land in `out/results.json`.
3. **Triage** each test that failed both attempts (`unexpected`); fails-then-passes is `flaky`:
   - Read the error and the trace path; reproduce over the API when quick.
   - Test defect (selector, wait, data collision) → `test-author` fixes it (≤ 3 rounds), `test-reviewer` reviews.
   - Product bug (behaviour contradicts a rule document) → no test edit; `qa-writer` writes `DEF-…`; the test stays failing in this run.
   - Unclear → `BLOCKED` with the evidence; never guess.
4. **Re-run** only what changed: `--grep` on the fixed titles.
5. **Assess**: `bun run qa:gate` → `out/release-gate.md`.
6. **Reflect: `.claude/rules/self-improve.md`.** A flaky test → `/flaky-hunt`; a product bug → `/verify-bug` flow (`.claude/rules/bug-lifecycle.md`).

Final response: selection (n of total, why), run command and totals, per failure: label (flaky / fixed / product bug / blocked) with root cause and files changed, defects filed, the gate decision.
