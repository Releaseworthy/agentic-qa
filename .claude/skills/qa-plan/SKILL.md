---
name: qa-plan
description: Risk-based test plan for a change — a branch/PR diff, a list of files, or a work-item card (CARD-…). Combines change-impact analysis, the vault's business rules and code dependencies to rank impacted areas by risk, choose regression coverage and set exit criteria. Writes out/plans/<id>.md. Invoke as /qa-plan [card id | --base <ref> | --files a,b].
argument-hint: "[CARD-… | --base <ref> | --files <paths>]"
---

# Risk-based test plan

Read `.claude/rules/orchestration.md` first.

1. **Scope the change.**
   - Diff / files → `bun run qa:impact --quiet [--base <ref> | --files <paths>]`, then read `out/impact.json`: impacted features with risk, selected tests, unmapped files.
   - Card → `get_document` it; its `feature` and `related` ids are the starting set; changed code is what the card's notes name (or "not built yet").
2. **Ground, in parallel** (one message):
   - `knowledge-scout`: for each impacted feature — its rules with boundaries, dependencies, open defects, existing manual cases.
   - `code-scout`: specs and helpers covering those features; gaps where a rule has no test (`bun run qa:trace` output helps).
3. **Rank risk.** Per area: likelihood (size and spread of change, import fan-out, past defects, complexity of the rule) × impact (feature criticality, rule severity, money/data). High / medium / low, one sentence of evidence each.
4. **Write the plan** to `out/plans/<card id or branch>.md`:
   - Scope and out of scope.
   - Risk table: area · risk · why (evidence ids) · coverage.
   - Coverage: automated regression to run (the `qa:impact` grep + anything added), new tests needed (per rule, API vs UI, who: `api-testgen` / `ui-qa`), manual/exploratory charters for what automation can't reach.
   - Environments and data (seed helpers).
   - Entry and exit criteria — measurable: e.g. 0 failing tests on criticality ≥ 4 features, every changed rule has ≥ 1 automated test, no open critical/high defect, pass rate ≥ 95 %.
5. **Review:** `test-reviewer` on the plan; apply its revisions (≤ 2 rounds).

Final response: the plan path, the risk table, the regression command (`bunx playwright test --grep "…"`), new tests to write, exit criteria.
