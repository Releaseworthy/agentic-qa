---
name: run-testcases
description: Executes manual test cases from the vault in the live app, the way a manual tester follows a script — parallel manual-tester agents in isolated playwright-cli sessions, a verdict and evidence per step — records the run (out/manual-runs/) for traceability and the release gate, files defects for real failures and updates cases that are out of date. Invoke as /run-testcases <TC-… | FEAT-… | --priority critical|high | --all> [--env dev|staging].
argument-hint: "<TC-… | FEAT-… | --priority <p> | --all> [--env <name>]"
---

# Manual test execution

Read `.claude/rules/orchestration.md` and `.claude/rules/browser.md` first.

1. **Select** with `list_documents('test-case')`: the ids given, a feature's cases, a priority and above, or all
   (`status: obsolete` never). `--env live` runs only cases whose preconditions need no seeding.
2. **Execute in parallel:** one `manual-tester` per 2–3 cases, in one message, each with the case ids, the env and
   its session prefix. Testers follow the case exactly; they don't explore.
3. **Record** the run: `out/manual-runs/<YYYY-MM-DD>-<HHmm>-<scope>.json` with `runId`, `env`, `executedAt` (ISO),
   `tester: "agent:manual-tester"` and the testers' cases. Validate with `bun run qa:manual --check <file>`; fix
   the file until it passes.
4. **Follow up every failure:**
   - suspected defect → confirm it with the API repro from `.claude/rules/bug-lifecycle.md`, then `qa-writer` files
     or updates the `DEF-…` (`status: confirmed`); put the id in the case's `defects` and re-validate.
   - `CASE_OUTDATED` → `qa-writer` updates the case from the observed steps; `test-reviewer` reviews it.
   - `blocked` → the blocker, verbatim.
   A case that passed with `status: draft` → `qa-writer` sets `status: ready`.
5. **Report:** `bun run qa:manual` (progress of the whole suite) and `bun run qa:trace` (manual-only rules).
6. **Reflect:** `.claude/rules/self-improve.md`.

Final response: run file, cases passed / failed / blocked with evidence for each failure, defects filed or updated, cases updated, suite progress, knowledge proposals.
