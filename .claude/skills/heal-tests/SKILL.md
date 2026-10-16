---
name: heal-tests
description: Test maintenance after an intended product change — sorts failing tests into "the app changed on purpose" (a label, a flow, a response field) vs "the app broke", re-discovers the new UI with playwright-cli, updates page objects, helpers, specs and manual cases to the new intended behaviour, and reports real regressions as bugs. Never weakens an assertion to go green. Invoke as /heal-tests [--results <path> | <grep>] [--card CARD-…].
argument-hint: "[--results <path> | <grep>] [--card CARD-…]"
---

# Self-healing test maintenance

Read `.claude/rules/orchestration.md` and `.claude/rules/browser.md` first.

1. **Failures:** from `--results` (default `out/results.json`), or run the grep. Group them by the page object,
   helper or schema they fail in — one change usually breaks many tests the same way.
2. **Intended or broken?** For each group, `knowledge-scout`: does a card, feature or rule say the behaviour changed
   (`--card`, `cards` scope, recently changed docs)? `git log -p` on `app/` for the change itself.
   - The vault and the change agree → **intended**: heal.
   - The behaviour contradicts a rule → **broken**: `PRODUCT_BUG` → `/verify-bug` flow; tests stay as they are.
   - A rule should change but the vault doesn't say so → `needs_human`: propose the rule edit (`propose_knowledge`,
     type `rule`) and stop that group.
3. **Re-discover** (intended UI changes): one `ui-explorer` per page — new labels, roles, the request each action
   waits for, `generate-locator`.
4. **Heal at the lowest layer:** `test-author` updates the page object / API helper / zod schema first, then specs
   only where the change is visible in the title or the expected values come from the new rule. Assertions keep
   their strength; only their values follow the new documented behaviour.
5. **Manual cases** that describe the old screens → `qa-writer` updates them (`CASE_OUTDATED`).
6. **Validate:** the failing tests now pass, the rest of the area still does (`--grep "@<feature>"`), typecheck, lint;
   `test-reviewer` reviews every healed file.
7. **Reflect:** `.claude/rules/self-improve.md`.

Final response: groups (cause, intended/broken), files healed, tests back to green, manual cases updated, bugs reported, knowledge proposals.
