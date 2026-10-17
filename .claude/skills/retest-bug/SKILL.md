---
name: retest-bug
description: Confirmation testing after a fix. Re-runs the bug's repro over the API and in the UI, runs its pinning test (which must now fail as "unexpectedly passed") and turns it into a normal regression test, runs regression around the fix, and closes or reopens the defect with evidence. Invoke as /retest-bug <DEF-…> [--base <ref>].
argument-hint: "<DEF-…> [--base <ref>]"
---

# Retest after a fix

Read `.claude/rules/orchestration.md`, `.claude/rules/browser.md`, `.claude/rules/test-data.md`, `.claude/rules/bug-lifecycle.md` and `.claude/rules/failure-triage.md` first.

1. **The defect:** `get_document <DEF-id>` for the steps, expected (rule), layer, the pinning test, and evidence under
   `out/bugs/<id>/`. Status should be `fixed`. If it's `confirmed`, retest anyway and say the fix was not announced.
2. **Pinning test:** `bunx playwright test --grep "<DEF-id>" --workers=1`. If the bug is fixed, it fails with "expected to fail,
   but passed". If it still fails as expected, the bug is still there (go to 6).
3. **Repro:** re-run `out/bugs/<id>/repro.ts` (write it from the defect's steps if missing) 3 times. It arranges its start state with the recipe in the defect's Steps (`arrange()`), never by hand. One
   `ui-explorer` walks the UI steps for `ui`/`both` from the same recipe (`bun run qa:arrange …`). All of them must show the expected behaviour from the rule.
4. **Regression around the fix:** `bun run qa:impact --quiet --base <ref>` (default `origin/main`) when the fix is in
   the diff, else `--grep "@<feature>"`; run it with `--retries=1`. Classify any new failure (`.claude/rules/failure-triage.md`), since the fix may have broken something.
5. **Fixed:** `test-author` turns the pinning test into a normal test: remove `test.fail`, keep the title and
   `@DEF-…` tag, assert the rule's expected values; run it; `test-reviewer` reviews. `qa-writer` sets
   `status: closed`, `verified: <date>`, a History line with the evidence.
6. **Not fixed / partly fixed:** `qa-writer` sets `status: reopened` with what still fails (verbatim) and the new
   evidence; the pinning test stays `test.fail`.
7. **Gate:** `bun run qa:triage <DEF-id>` shows the new state; if a release is pending, `bun run qa:gate`.
8. **Reflect:** `.claude/rules/self-improve.md`.

Final response: closed or reopened, evidence per layer, the converted test (file › title) and its run, regression run (selection, totals), knowledge proposals.
