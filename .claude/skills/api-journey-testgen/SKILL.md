---
name: api-journey-testgen
description: Generates API integration tests for complete user journeys executed entirely through API calls, mirroring the UI business flow — chains requests across steps and verifies data dependencies, state transitions and the final business outcome. Invoke as /api-journey-testgen "<journey in words>" [FEAT-ids].
argument-hint: "\"<journey>\" [FEAT-…]"
---

# Journey test generation

Read `.claude/rules/orchestration.md` first.

1. **Model the journey.** From the request and `knowledge-scout` (features involved, their rules, state machines): the actors (one customer, two competing customers, admin), the ordered steps as the UI would do them, the data each step produces that a later step consumes, and the business outcome at the end (order state, stock, totals, history).
2. **Find the risky seams** between steps: re-validation at checkout (stock, coupon minimum), state transitions (placed → shipped → no cancel), concurrency (two customers, last units), totals carried from cart to order. Each seam is an assertion in the journey.
3. **Check existing journeys** with `code-scout` (`tests/api/journeys/`) — extend instead of duplicating.
4. **Delegate** to `test-author`: one `test` per journey in `tests/api/journeys/<name>.spec.ts`, each step a `test.step`, setup data via `seed`, steps via `api.as(actor)`, final assertions on business state; tags `@journey` + every `@FEAT`/`@BR` it proves.
5. **Review** with `test-reviewer` (≤ 2 rounds); `PRODUCT_BUG` → `qa-writer` files the defect, then `test-author` pins the journey with its id (`test.fail(true, 'DEF-…: …')`, `@DEF-…`).
6. **Reflect: `.claude/rules/self-improve.md`.**

Final response: the journey(s) with steps and seams asserted, file, run result, defects, verdict.
