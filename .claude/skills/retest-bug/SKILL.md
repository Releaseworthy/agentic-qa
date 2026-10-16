---
name: retest-bug
description: Confirmation testing after a fix — re-runs the bug's repro over the API and in the UI, runs its pinning test (which must now fail as "unexpectedly passed") and turns it into a normal regression test, runs regression around the fix, and closes or reopens the defect with evidence. Invoke as /retest-bug <DEF-…> [--base <ref>].
argument-hint: "<DEF-…> [--base <ref>]"
---

# Retest after a fix

Read `.claude/rules/orchestration.md`, `.claude/rules/browser.md` and `.claude/rules/bug-lifecycle.md` first.

1. **The defect:** `get_document <DEF-id>` — steps, expected (rule), layer, the pinning test, evidence under
   `out/bugs/<id>/`. Status should be `fixed`; `confirmed` → retest anyway and say the fix was not announced.
2. **Pinning test:** `bunx playwright test --grep "<DEF-id>" --workers=1`. Fixed → it fails with "expected to fail,
   but passed". Still failing as expected → the bug is still there (go to 6).
3. **Repro:** re-run `out/bugs/<id>/repro.ts` (write it from the defect's steps if missing) 3 times; one
   `ui-explorer` walks the UI steps for `ui`/`both`. All must show the expected behaviour from the rule.
4. **Regression around the fix:** `bun run qa:impact --quiet --base <ref>` (default `origin/main`) when the fix is in
   the diff, else `--grep "@<feature>"`; run it with `--retries=1`. A new failure → triage it like `/regression`.
5. **Fixed:** `test-author` turns the pinning test into a normal test: remove `test.fail`, keep the title and
   `@DEF-…` tag, assert the rule's expected values; run it; `test-reviewer` reviews. `qa-writer` sets
   `status: closed`, `verified: <date>`, a History line with the evidence.
6. **Not fixed / partly fixed:** `qa-writer` sets `status: reopened` with what still fails (verbatim) and the new
   evidence; the pinning test stays `test.fail`.
7. **Gate:** `bun run qa:triage <DEF-id>` shows the new state; if a release is pending, `bun run qa:gate`.
8. **Reflect:** `.claude/rules/self-improve.md`.

Final response: closed or reopened, evidence per layer, the converted test (file › title) and its run, regression run (selection, totals), knowledge proposals.
