---
name: flaky-hunt
description: Finds and fixes flaky tests — runs the suspects many times without retries, ranks them by failure rate (qa:flaky), finds the root cause (missing wait, shared data, order dependency, time, environment) from traces and the app, fixes the test or framework, and proves the fix with another repeated run. Never hides flakiness with retries, timeouts or skips. Invoke as /flaky-hunt [<grep> | --from-results <path>] [--repeat 10].
argument-hint: "[<grep> | --from-results <path>] [--repeat <n>]"
---

# Flaky test hunt

Read `.claude/rules/orchestration.md` and `.claude/rules/failure-triage.md` first.

1. **Suspects:** the grep given; or tests marked `flaky` in `--from-results` (default `out/results.json`); or the
   whole `api`+`chromium` suite when nothing is given.
2. **Measure:** `bunx playwright test --project=api --project=chromium --grep "<suspects>" --repeat-each=<n> --retries=0 --workers=4`
   (default n = 10; split into several runs if one would pass 90 s per test file), then `bun run qa:flaky` →
   `out/stability.md`. `broken` (fails every run) is not flaky — classify it (`.claude/rules/failure-triage.md`), never "stabilise" it.
3. **Root cause** per flaky test — from the error lines, the trace (`bunx playwright show-trace <zip>`), and the app:
   | Symptom | Usual cause |
   | --- | --- |
   | passes alone, fails with `--workers=4` | shared data (seeded product, shared account) — `LRN-TEST-DATA` |
   | assertion before the screen updated | an action that doesn't wait for its response — `LRN-UI-WAITS` |
   | depends on which test ran first | order dependency, leaked state |
   | near midnight / month end | time — dates must go through `@utils/date` |
   | only on one browser | timing or a browser difference: reproduce with `--project=<browser>` |
   Confirm the cause before fixing (e.g. rerun with `--workers=1`: if it becomes stable, it was shared data).
4. **Fix:** `test-author` fixes the test or the framework (page-object wait, own data, isolation) — never a timeout,
   `waitForTimeout`, retry, skip or a looser assertion; `bun run qa:heal-guard` passes. `test-reviewer` reviews.
5. **Prove:** the same repeated run on the fixed tests: 0 failures in n runs. Still flaky after 2 rounds → `BLOCKED`
   with the evidence; an app-side race (the product misbehaves under concurrency) → `PRODUCT_BUG` → `qa-writer`.
6. **Reflect:** `.claude/rules/self-improve.md` — a new flake pattern is exactly what the vault should learn.

Final response: suspects and runs, rate before → after per test, root cause and fix (files), anything blocked or reported, knowledge proposals.
