---
name: write-testcases
description: Designs manual test cases for a feature, a business rule or a card with test-design techniques (equivalence partitions, boundary values, decision tables, state transitions, error guessing), checks them against the existing suite to avoid duplicates, and writes them into the vault as TC documents for review. Invoke as /write-testcases <FEAT-… | BR-… | CARD-…> [focus].
argument-hint: "<FEAT-… | BR-… | CARD-…> [focus]"
---

# Manual test-case design

Read `.claude/rules/orchestration.md` first.

1. **Ground, in parallel:** `knowledge-scout` gets the rules of the target with every boundary, error code and message verbatim, the pages and flows, open defects, and the existing cases (`test-cases` scope) with what each covers. `code-scout` finds which of those are automated already (`bun run qa:trace` output helps).
2. **Design** (write the table before any document), using the technique that fits each rule:
   - boundaries → values below, at, above each limit (BR-CART-01: 0, 1, 10, 11, add-to-existing crossing 10);
   - combinations → a decision table (coupon × minimum × shipping threshold);
   - states → a state-transition table (placed → shipped / cancelled; every invalid transition);
   - error guessing from open defects and `learnings`.
   Keep a case only if no existing case covers it. Rank by risk: feature criticality × rule severity.
3. **Write:** `qa-writer` writes one `TC-…` per kept case, `status: draft` (a card, or labels not yet seen in the
   app) or `ready` (labels confirmed from `app/web/` or an earlier exploration), with `setup` naming
   the framework recipe that arranges its preconditions (`.claude/rules/test-data.md`; `SETUP-RECIPES`) and expected
   results verbatim from the rules. If no recipe covers a precondition (`RECIPE_MISSING`), `test-author` adds the recipe
   first (`test-reviewer` reviews it), then `bun run qa:arrange --catalog`, then the case. `bun run qa:arrange --check` passes.
4. **Review:** `test-reviewer` on each case (≤ 2 rounds).
5. **Reflect:** `.claude/rules/self-improve.md`.

Final response: the design table (case → technique → rule → priority → recipe), recipes added, cases written (ids, status), duplicates skipped, review verdicts, knowledge proposals.
