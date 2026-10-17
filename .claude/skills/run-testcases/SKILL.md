---
name: run-testcases
description: Executes manual test cases from the vault in the live app, the way a manual tester follows a script — parallel manual-tester agents in isolated playwright-cli sessions, a verdict and evidence per step — records the run (out/manual-runs/) for traceability and the release gate, files defects for real failures and updates cases that are out of date. Invoke as /run-testcases <TC-… | FEAT-… | --priority critical|high | --all> [--env dev|staging].
argument-hint: "<TC-… | FEAT-… | --priority <p> | --all> [--env <name>]"
---

# Manual test execution

Read `.claude/rules/orchestration.md`, `.claude/rules/browser.md` and `.claude/rules/test-data.md` first.

1. **Select** with `list_documents('test-case')`: the ids given, a feature's cases, a priority and above, or all
   (never `status: deprecated`; an `outdated` case is reported as waiting for its update, not run). `--env live` runs only cases whose `setup` recipe creates nothing (`bun run qa:arrange --list --json`, `seeds: false`).
2. **Execute in parallel:** one `manual-tester` per 2–3 cases, in one message, each with the case ids, the env and
   its session prefix. Testers arrange each case's preconditions with `bun run qa:arrange --case <id>` and perform only its steps; they don't explore. A case whose `setup` is missing or fails → `blocked`, and `qa-writer` fixes the case (`RECIPE_MISSING` → `test-author` adds the recipe).
3. **Record** the run: `out/manual-runs/<YYYY-MM-DD>-<HHmm>-<scope>.json` with `runId`, `env`, `executedAt` (ISO),
   `tester: "agent:manual-tester"` and the testers' cases. Validate with `bun run qa:manual --check <file>`; fix
   the file until it passes.
4. **Follow up every failure:**
   - suspected defect → confirm it with the API repro from `.claude/rules/bug-lifecycle.md`, then `qa-writer` files
     or updates the `DEF-…` (`status: confirmed`); put the id in the case's `defects` and re-validate.
   - `CASE_OUTDATED` → only when a rule, feature or card already documents the new behaviour (`.claude/rules/failure-triage.md`):
     `qa-writer` updates the case from the observed steps (`status: ready`), or sets `status: outdated` when the new
     steps were not walked yet; `test-reviewer` reviews it. Undocumented → `UNKNOWN`, a question for Product, the case
     unchanged.
   - `blocked` → the blocker, verbatim.
   A case that passed with `status: draft` → `qa-writer` sets `status: ready`.
5. **Report:** `bun run qa:manual` (progress of the whole suite) and `bun run qa:trace` (manual-only rules).
6. **Reflect:** `.claude/rules/self-improve.md`.

Final response: run file, cases passed / failed / blocked with evidence for each failure, defects filed or updated, cases updated, suite progress, knowledge proposals.
