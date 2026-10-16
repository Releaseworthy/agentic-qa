---
name: regression
description: Impact-based regression — selects the tests a change can break (change-impact analysis over code, rules and the import graph), runs them in parallel, and triages every failure into flaky, test defect (fixed) or product bug (reported), then hands the results to the release gate. Invoke as /regression [--base <ref> | --full].
argument-hint: "[--base <ref> | --full]"
---

# Impact-based regression

Read `.claude/rules/orchestration.md` and `.claude/rules/failure-triage.md` first.

1. **Select**: `--full` → everything; otherwise `bun run qa:impact --quiet [--base <ref>]` and read `out/impact.json`. `full: true` → everything; `selected: 0` → report "no test impact" and stop. Unmapped files → list them (a feature card needs `code:` for them).
2. **Run**: `bunx playwright test --project=api --project=chromium --grep "<grep>" --workers=4 --retries=1` (no `--grep` for full). Results land in `out/results.json`.
3. **Triage** each test that failed both attempts (`unexpected`); fails-then-passes is `flaky`. Classify with
   `.claude/rules/failure-triage.md`: the vault's value, the observed value from a framework-arranged repro
   (`bun run qa:arrange …` / `arrange()`, `.claude/rules/test-data.md`), the class.
   - `TEST_DEFECT` → `test-author` fixes it to the vault (≤ 3 rounds), `test-reviewer` reviews, `bun run qa:heal-guard` passes.
   - `PRODUCT_BUG` → no test edit; `/verify-bug` flow, `qa-writer` writes `DEF-…`; the test stays failing in this run.
   - `INTENDED_CHANGE` → `/heal-tests` for that group. `UNKNOWN` / `ENVIRONMENT` → `BLOCKED` with the evidence; never guess.
4. **Re-run** only what changed: `--grep` on the fixed titles.
5. **Assess**: `bun run qa:gate` → `out/release-gate.md`.
6. **Reflect: `.claude/rules/self-improve.md`.** A flaky test → `/flaky-hunt`; a product bug → `/verify-bug` flow (`.claude/rules/bug-lifecycle.md`).

Final response: selection (n of total, why), run command and totals, per failure: label (flaky / fixed / product bug / blocked) with root cause and files changed, defects filed, the gate decision.
