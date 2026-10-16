---
name: automate-tc
description: Turns manual test cases into Playwright tests — picks the layer (UI spec through page objects, or API spec when the case's outcome is a business rule the API proves), reuses the framework, keeps the case's steps as named test steps, runs them, and links the case back with automated_by. Invoke as /automate-tc <TC-… [TC-…] | --unautomated [FEAT-…]>.
argument-hint: "<TC-… | --unautomated [FEAT-…]>"
---

# Manual case → automated test

Read `.claude/rules/orchestration.md` first.

1. **Select:** the ids given, or `--unautomated` → cases with `automated_by: none` (optionally of one feature),
   highest priority first. Skip `status: draft` cases — walk them first (`run-testcases`).
2. **Ground, in parallel:** `knowledge-scout` — each case with its rules. `code-scout` — the page objects, seed
   helpers and existing spec for the area, and which page-object actions the steps need that don't exist yet.
   Missing locators → one `ui-explorer` session to record them (`generate-locator`, the request each action waits for).
3. **Decide the layer per case:** UI when the title is about what the customer sees; API when every expected
   result is a rule outcome (then the UI case stays manual-only or keeps a thin UI check). Write the mapping down:
   case step → `test.step` title → page-object call → assertion with its message.
4. **Delegate** to `test-author`: one test per case, titled like the case, tagged `@FEAT`/`@BR` from `covers`,
   preconditions via `seed`/fixtures, each case step a `test.step` named after it, every assertion carrying the
   expected result as its message. Validate with `--grep`, typecheck, lint.
5. **Review:** `test-reviewer` (≤ 2 rounds). `PRODUCT_BUG` → `qa-writer` defect, test stays `test.fail` with the id.
6. **Link:** `qa-writer` sets each case's `automated_by` to `<spec> › <describe> › <title>`.
7. **Reflect:** `.claude/rules/self-improve.md`.

Final response: per case the test added (file › title, layer), run result, cases linked, defects, verdicts, knowledge proposals.
