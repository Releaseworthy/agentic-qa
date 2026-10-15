# Test authoring

- **Scope = the title.** One behaviour per test, stated in its title. No extra assertions; add a step only when the title's flow can't be reached or verified without it.
- **Tags:** every test carries its feature (`@FEAT-…`, usually on the `describe`) and each business rule it proves (`@BR-…`). `@smoke` marks the critical path, `@journey` multi-step API journeys. Traceability and impact selection read these.
- **Setup is not the test.** Data comes from `seed.*` (`customer`, `product({ priceCents, stock })`, `coupon`, `cart`, `order`, `shipped`) or fixtures — never UI clicks, unless the UI flow is the title. A test creates the data it changes; seeded catalog data is read-only (see `LRN-TEST-DATA`).
- **API specs:** call helpers (`api.as(customer).cart.add(...)`), assert refusals with `expectRefused(call, status, code)`, send malformed bodies with `api.raw(...)`. Endpoint specs live in `tests/api/endpoints/<resource>.spec.ts`, one `describe` per endpoint, positive then negative cases, boundaries from the rule document.
- **Journey specs** (`tests/api/journeys/`) chain the calls of one business flow entirely over the API, each step in a `test.step`, and end on the business outcome (state, stock, history), not on a status code.
- **UI specs:** only through page objects (`framework/pages/`); no raw locators in specs. Page-object actions that call the API wait for that response (`waitForResponse` set up before the click); navigation waits on `body[data-ready]`. Role/label locators; `exact: true` when one label contains another.
- **Assertions** use web-first `expect(locator)` in UI tests; exact values (cents, messages) from the rule documents.
- **Known product bug:** `test.fail(true, 'DEF-xxx: …')` placed after setup, title starting with the defect id, plus `@DEF-xxx`.
- **Validate:** run the new or changed tests with `--grep`, then `bun run typecheck` and `bun run lint`. A failure you can't explain from code is a reason to look at the app (browser or API), not to loosen the test.
