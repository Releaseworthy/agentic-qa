---
name: test-report
description: Test summary report for stakeholders — automated results, manual execution progress, coverage, defects (open by severity, aging, found by), risks and the release decision, in plain words a non-technical reader can act on. Invoke as /test-report [--results <path>] [--period sprint|release|daily] [--release <name>].
argument-hint: "[--results <path>] [--period <p>] [--release <name>]"
---

# Test summary report

1. **Evidence** (all deterministic, run them, don't estimate):
   - automated: `bun run qa:gate [--results <path>]` → `out/release-gate.json` (run `bun run test` first when there are no results);
   - manual: `bun run qa:manual` → `out/manual-progress.json`;
   - coverage: `bun run qa:trace [--results <path>]` → `out/traceability.json`;
   - defects: `bun run qa:triage --all` → `out/triage.json` (metrics);
   - stability, when present: `out/stability.json`; knowledge: the last entries of `knowledge/_curation/ledger.jsonl`.
2. **Interpret:** what is done vs planned (manual cases not run, rules only verified manually), where the risk is
   (features with failures, open high defects, aging defects), which technique found the most bugs, what changed since
   the last report (`git log` for the period).
3. **Write** `out/reports/<YYYY-MM-DD>-<period>.md`:
   - **Summary** — 3 sentences: state, decision (as the gate says), the one thing that needs attention.
   - **Execution** — automated (passed / failed / flaky / known defects), manual (passed / failed / blocked / not run).
   - **Coverage** — features × automated / manual / untested; rules nothing verifies.
   - **Defects** — open by severity and priority, new / closed / reopened in the period, mean age, found by.
   - **Risks and next steps** — each with an owner.
   - **Evidence** — report paths and commands.
4. **Reflect:** `.claude/rules/self-improve.md`.

Never invent a number: every figure comes from the reports in step 1. Final response: the report path and the summary.
