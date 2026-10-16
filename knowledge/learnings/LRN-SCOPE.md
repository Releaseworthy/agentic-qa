---
id: LRN-SCOPE
type: learning
title: A test covers exactly what its title says
status: active
confidence: established
support: 1
applies_to: [tests/**, knowledge/test-cases/**]
sources: [PR review]
evidence: ['review: PR review']
created: 2026-10-15
updated: 2026-10-15
---

# A test covers exactly what its title says

- One behaviour per test; the title states it. No extra assertions "while we
  are here" — they make a failure ambiguous.
- Setup is not part of the test: it goes through API helpers (`seed.*`) or
  fixtures, never through UI clicks, unless the UI flow *is* the title.
- Tag every test with the feature (`@FEAT-…`) and each business rule it proves
  (`@BR-…`): the traceability report and impact-based regression read the tags.
- Known product bugs stay visible: `test.fail()` with the defect id in the
  title (`DEF-001 …`), never a weakened assertion or a skip.
