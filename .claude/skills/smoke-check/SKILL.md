---
name: smoke-check
description: Post-deployment verification of an environment — health and environment identity, the @smoke suite (only @readonly tests on live), and a short playwright-cli walk of the critical pages as the saved returning customer — ending in PASS / FAIL with a rollback recommendation. Invoke as /smoke-check [--env staging|live|dev].
argument-hint: "[--env <name>]"
---

# Post-deploy smoke check

Read `.claude/rules/browser.md` first. Default env `staging`. Nothing here writes data on live.

1. **Identity:** `TEST_ENV=<env> bun run seed:session --name smoke-<env> --account returning-customer` — it
   checks `/health` and signs in the saved account. A health answer from another
   environment, or no answer → FAIL, stop.
2. **Automated smoke:** `TEST_ENV=<env> bunx playwright test --project=api --project=chromium --grep @smoke`
   (`--grep @readonly` on live), `--retries=1`. Results in `out/results.json`.
3. **Critical pages by eye:** one `ui-explorer` session (`smoke-<env>`) as the returning customer: catalog loads with
   products and the env badge (hidden on live), a product page shows price and stock, cart opens, order history lists
   orders, an order page shows its lines. Screenshots in `out/smoke/<env>/`. Read-only: no add to cart on live.
4. **Verdict:** FAIL when any smoke test fails twice, a critical page is broken, or the identity check failed; flaky
   only → PASS with a note. FAIL on a deploy → recommend rollback and name the failing area.
5. **Write** `out/smoke/<env>-<YYYY-MM-DD>.md`: verdict, what ran, failures with evidence, recommendation.
6. **Reflect:** `.claude/rules/self-improve.md`.

Final response: PASS / FAIL, env and health, smoke totals, page checks, rollback recommendation, knowledge proposals.
