---
id: LRN-SCOPE
type: learning
title: A test covers exactly what its title says
status: active
confidence: established
support: 2
applies_to: [tests/**, knowledge/test-cases/**, .claude/agents/test-author.md, .claude/skills/api-testgen/SKILL.md, .claude/skills/api-journey-testgen/SKILL.md, .claude/skills/automate-tc/SKILL.md, .claude/skills/ui-qa/SKILL.md, qa/heal-guard.ts]
sources: [PR review, 'Human review feedback (second review, 2026-10-17)']
evidence: ['review: PR review', 'human: Second review of agentic-qa, 2026-10-17', 'code: qa/heal-guard.ts:261', 'code: commit d2789de']
created: '2026-10-15'
updated: '2026-10-17'
---

# A test covers exactly what its title says

- One behaviour per test; the title states it. No extra assertions "while we
  are here", because they make a failure ambiguous.
- Setup is not part of the test: it goes through API helpers (`seed.*`) or
  fixtures, never through UI clicks, unless the UI flow *is* the title.
- Tag every test with the feature (`@FEAT-…`) and each business rule it proves
  (`@BR-…`): the traceability report and impact-based regression read the tags.
- Known product bugs stay visible: `test.fail()` with the defect id in the
  title (`DEF-001 …`), never a weakened assertion or a skip.
- **Pin only with a filed defect id, never a placeholder.** A test that exposes
  a product bug is not pinned with `test.fail(true, 'PRODUCT_BUG: …')`. Order:
  report `PRODUCT_BUG` and leave the test failing → `qa-writer` files the
  defect (`DEF-…`) → `test-author` pins it with `test.fail(true, 'DEF-…: …')`
  placed after setup, the title starting with the id, tagged `@DEF-…`. Why: the
  heal guard (`qa/heal-guard.ts`, `unpinnedFails`) refuses any `test.fail` that
  does not name an open `DEF-` id the same file tags, so a headless
  api-testgen run with a placeholder pin has its whole patch blocked before a
  pull request exists. No defect filed in the run → leave the test red and
  report `PRODUCT_BUG`; never invent an id.
