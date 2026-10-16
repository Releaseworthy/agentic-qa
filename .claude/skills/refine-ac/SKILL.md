---
name: refine-ac
description: Acceptance-criteria refinement for a work-item card before development — grounds the draft AC in the vault's business rules, finds ambiguities, conflicts with existing rules, missing edge cases and negative paths, and produces testable Given/When/Then criteria plus the questions Product and Engineering must answer. Invoke as /refine-ac <CARD-id>.
argument-hint: "<CARD-id>"
---

# Acceptance-criteria refinement

Read `.claude/rules/orchestration.md` first.

1. `get_document <CARD-id>`; note its feature, related ids, draft AC and notes.
2. **Ground** with `knowledge-scout` (one call, all questions): the rules of the card's feature and related ids; how today's flow behaves where the card changes it (pricing order, error contract, state machines, UI patterns); open defects in that area.
3. **Analyse every draft criterion:**
   - Ambiguity: a word two people would read differently ("costs extra", "per item if the customer wants").
   - Conflicts with existing rules (e.g. a new fee and `BR-SHIP-01`'s threshold "after discount"; a new line and `BR-CART-01`).
   - Missing: limits, boundaries, empty/maximum input, validation messages, error codes, permissions, interaction with coupons/shipping/stock/cancellation, UI states, API contract, accessibility.
   - Testability: each criterion must have an observable outcome.
4. **Write** `out/ac/<CARD-id>.md`:
   - Questions for Product / Engineering — numbered, each with why it matters and a proposed default.
   - Refined AC — Given/When/Then, each with its negative path, exact values; mark which rely on a proposed default.
   - Impact on existing rules and tests (ids), proposed new rule documents.
   - Test ideas: API (endpoint + journey) and UI, by priority.
5. **Review:** `test-reviewer` (target: AC). Apply revisions (≤ 2 rounds).
6. Do **not** edit the card itself — Product owns it. Offer the refined AC for them to paste, or file it with `propose_knowledge` (`type: card`, `kind: update`): the gate routes it to Product.
7. **Reflect: `.claude/rules/self-improve.md`.**

Final response: the output path, the open questions, the refined AC count, conflicts found.
