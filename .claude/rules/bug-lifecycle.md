# Bug lifecycle (verify-bug, bug-triage, retest-bug)

- **States** (`knowledge/defects/DEF-*.md` `status`): `new` → `confirmed` → `fixed` → `closed`; a failed
  retest → `reopened`; `rejected` with `resolution: not-a-bug | duplicate | cannot-reproduce | wont-fix` (and
  `duplicate_of` for a duplicate). Every transition appends `- <YYYY-MM-DD> <status>: <why, evidence>` under
  `## History`, written by `qa-writer` and reviewed by `test-reviewer`.
- **Expected comes from the vault.** A behaviour is a bug only when it contradicts a rule or feature document
  (cite the id). If no document covers it, it's a question for Product and not a defect (`NEEDS_INFO`).
- **Reproduce at both layers, from a recipe.** The start state is a framework recipe (`.claude/rules/test-data.md`),
  written into the defect's Steps as `bun run qa:arrange <recipe> …` so every retest arranges the same state. Do the API
  first (`out/bugs/<DEF-id>/repro.ts`: `arrange()` then the call under test, run with `bun run`, prints request and
  response), which shows whether the backend is wrong. Then do the UI with `playwright-cli` (`ui-explorer`) to see
  what the customer sees. `layer`: `api` (API wrong), `ui` (API right, screen wrong), `both`.
- **Evidence** lives in `out/bugs/<DEF-id>/`: the repro script and its output, screenshots, response bodies.
  Reproduce 3 times. If it's intermittent, say how often (2/3) and keep it `new` until the trigger is known.
- **Severity** (impact): critical = money, data or security; high = a rule broken in a main flow; medium = a rule
  broken off the main flow; low = cosmetic or with an easy workaround. **Priority** comes from
  `bun run qa:triage` (severity × feature criticality); deviate only with a written reason.
- **Pinned by a test.** A confirmed bug gets a `test.fail(true, 'DEF-xxx: …')` test titled with its id and tagged
  `@DEF-xxx`, at the layer it lives in (API spec for `api`/`both`, UI spec for `ui`). It passes while the bug
  exists and turns red the day it's fixed, and that's the signal the retest looks for.
- **Never** edit `app/` to fix a bug, and never weaken a test to make a bug disappear.
