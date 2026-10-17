---
name: heal-tests
description: Test maintenance with a verdict first. Classifies every failing test (product bug, intended change, test defect, environment, flaky, unknown) against the vault and a framework-arranged repro, reports bugs instead of healing them, updates tests only to behaviour a rule/feature/card already documents (or a stale locator/wait), and proves it with the heal guard. Never edits a test to make it pass. Invoke as /heal-tests [--results <path> | <grep>] [--card CARD-…] [--base <ref>].
argument-hint: "[--results <path> | <grep>] [--card CARD-…] [--base <ref>]"
---

# Test maintenance: verdict first

Read `.claude/rules/orchestration.md`, `.claude/rules/failure-triage.md`, `.claude/rules/test-data.md` and
`.claude/rules/browser.md` first. The goal is a correct verdict for each failure. Getting the run green doesn't count on its own.

1. **Failures:** from `--results` (default `out/results.json`), or run the grep. Group them by the page object,
   helper or schema they fail in, and by the error kind: a locator/timeout error vs a value mismatch
   (`Expected … Received …`) vs a refusal code.
2. **Expected, per group** (parallel): `knowledge-scout` returns the rule / feature / card each test tags, verbatim values,
   and whether that document changed since the test did (`git log -1 --format=%cs -- <doc>` vs `<spec>` on the base
   ref). With `--card`, include that card too.
3. **Observed, per group:** reproduce the failing check outside the test. Use `bun run qa:arrange <recipe> …` (or
   `arrange()` in `out/heal/<group>/repro.ts`) for the start state, then the single API call, or one `ui-explorer`
   step for UI-only groups. Record the actual value verbatim.
4. **Classify** each group with the table in `.claude/rules/failure-triage.md`, citing the document id and both values.
   - `PRODUCT_BUG` → `/verify-bug` flow (`.claude/rules/bug-lifecycle.md`); the tests stay as they are.
   - `UNKNOWN` (nothing documents the new behaviour) → `propose_knowledge` (type `rule`/`feature`, goes to a human)
     with the observed behaviour as evidence, and stop that group: `status: needs_human`.
   - `ENVIRONMENT` / `FLAKY` → report, or `/flaky-hunt`; no test edit.
   - `TEST_DEFECT` and `INTENDED_CHANGE` → heal (5).
5. **Heal** (only those two classes):
   - Locators: one `ui-explorer` per changed page for the new labels, roles, the request each action waits for, and
     `generate-locator`.
   - `test-author` fixes the lowest layer first (page object, API helper, zod schema, recipe), then specs. An
     expected value changes only to the value the cited document states; assertions keep their strength.
   - Manual cases that describe the old screens → `qa-writer` updates them (`CASE_OUTDATED`).
6. **Guard:** `bun run qa:heal-guard --base <ref> --intended <DOC-ID> …` (one `--intended` per `INTENDED_CHANGE`
   document; default base `origin/main`). Revert every ✗. Never argue with it or work around it. Headless runs
   list the documents under `intended` in the structured result; CI runs the guard again before the PR opens.
7. **Validate:** the healed tests pass, the rest of the area still does (`--grep "@<feature>"`), typecheck, lint;
   `test-reviewer` reviews every healed file against the classification.
8. **Reflect:** `.claude/rules/self-improve.md`.

Final response, per group: tests, class, expected (DOC-ID, value) vs observed (value, repro), action. Then files healed;
the heal-guard result; tests back to green; bugs reported; questions for Product; knowledge proposals.
