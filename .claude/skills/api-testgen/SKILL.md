---
name: api-testgen
description: Generates and runs endpoint-level API tests (positive and negative cases for each named endpoint) as soon as the backend is implemented, reusing the framework's API helpers, seed data and fixtures. Invoke as /api-testgen <METHOD /path | FEAT-id | BR-id> [more…].
argument-hint: "<METHOD /api/path | FEAT-… | BR-…> […]"
---

# Endpoint test generation

Read `.claude/rules/orchestration.md` first.

1. **Resolve targets** to endpoints: a `FEAT-…` → its `endpoints`; a `BR-…` → the endpoints of its feature that the rule constrains. List them.
2. **Ground, in parallel** (one message):
   - `knowledge-scout`: per endpoint, the request shape, success answer, every rule and boundary, every refusal (status + code + message).
   - `code-scout`: the helper for each endpoint (`framework/api/*`), `seed` helpers, the existing spec and its uncovered cases.
   - When the vault is silent on a detail, probe the running API yourself with `api.raw`-style calls through a scratch script in `out/`. Treat the answer as evidence of current behaviour; it isn't a spec.
3. **Case design** per endpoint (write it down before code): happy path; each validation (missing/invalid field, wrong type); each business rule at its boundaries (below, at, above); auth (no token, someone else's resource); state conflicts. Skip cases an existing test already covers.
4. **Delegate** to `test-author`: the endpoint list, the case table with exact expected values and DOC-ids, the target spec file(s), the helpers to reuse, missing helpers to add. One `describe` per endpoint, tags `@FEAT-…` + `@BR-…`.
5. **Review** with `test-reviewer` (≤ 2 rounds).
6. If the author reports a `PRODUCT_BUG`, `qa-writer` writes the defect (`DEF-…`, confirmed by the API repro in `.claude/rules/bug-lifecycle.md`), then `test-author` pins the test with that id (`test.fail(true, 'DEF-…: …')`, `@DEF-…`).
7. **Reflect: `.claude/rules/self-improve.md`.**

Final response: per endpoint the cases added (titles, tags), the run command and result, product bugs found (DEF ids), review verdict.
