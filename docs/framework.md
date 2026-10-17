# Playwright framework

Playwright + TypeScript on Bun: API helpers with zod contracts, page objects, a data seed, named preconditions
(recipes) and fixtures under `framework/`; specs under `tests/api/endpoints`, `tests/api/journeys` and `tests/ui`.

- **Setup over the API, assert at the surface.** `seed.product({ priceCents, stock })`, `seed.cart`, `seed.order`,
  `seed.shipped` and the named recipes on top of them (`arrange('cart', …)`) create data each test owns, so all
  112 tests run fully parallel.
- **Validated contracts.** Zod schemas check every response. `expectRefused(call, status, code)` asserts the error
  contract.
- **Page objects wait for the request behind an action,** never for time. Locators are role and label based.
- **Readable reports.** Page-object and seed methods carry `@step('Place the order')`, and every API call shows as
  `POST /api/orders`, so a trace reads as business actions. Non-obvious assertions say what they check:
  `expect(orderPage.cancelButton, '"Cancel order" is not offered for a shipped order').toBeHidden()`.
- **One way to do things, enforced by ESLint.** Imports only through tsconfig aliases (`@api`, `@pages/*`,
  `@app/*`, …); dates only through `@utils/date` (date-fns), so test cards expire relative to today and never go
  stale; every assertion sits in a named Given/When/Then `test.step` and carries a message.
- **Tags drive everything.** `@FEAT-…`, `@BR-…` and `@DEF-…` feed traceability, impact selection and the gate.
  Known bugs run as `test.fail()` (DEF-001).

## Environments and accounts

`TEST_ENV` picks `env/.env.<name>`. Real env vars and a gitignored `.local` file override it.

| `TEST_ENV`      | ShopLite                                 | What runs                                       |
| --------------- | ---------------------------------------- | ----------------------------------------------- |
| `dev` (default) | :3100, test hooks on (seeded defects)    | everything                                      |
| `staging`       | :3200, no test hooks, its own accounts   | everything (CI: `@smoke`)                       |
| `live`          | :3300, no test hooks, no admin for tests | `@readonly` only; seeding or registering throws |

Each env file can start a local stand-in for its deployment (`START_APP`), handing it the decrypted accounts the way
a deployment injects secrets. Point `BASE_URL` at a real deployment and set `START_APP=false` to test that one
instead. Global setup and `qa:arrange` both check that `/health` answers as `TEST_ENV`, so a staging config never
seeds live.

Tests pick who they are with `test.use({ account })`: **`GUEST`** (default), **`NEW_CUSTOMER`** (registered per
test, for anything that changes per-user state), **`RETURNING_CUSTOMER`** (saved, with order history, read-only),
**`ADMIN`** (saved; the seed acts as it). Global setup signs the saved accounts in over the API and stores their
storage states in `.auth/<env>/<account>.json`, reused until 5 minutes before expiry and re-verified on every run.
The browser starts signed in from that state and never goes through the login form, which has tests of its own.
Credentials are committed only as `enc1.…` tokens (AES-256-GCM, a key derived per token with HKDF-SHA256).

## Preconditions and test data: arrange with the framework, act by hand

A manual run, a bug repro, an exploration and a spec all start from the same **named recipe**
(`framework/setup/recipes.ts`): `guest`, `returning-customer`, `customer`, `locked-out`, `product`, `cart`,
`coupon` (any shape: minimum, cap, expired), `order` (placed, shipped, cancelled). Agents never click through
registration, cart or checkout to reach a start state, and never invent cards, dates or emails.

| Who                     | How                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| manual tester, explorer | `bun run qa:arrange --case TC-CHK-002 --name s1` → JSON with ids, `testData`, `next` commands to open the state |
| bug repro (`repro.ts`)  | `await arrange(request, 'coupon', { expired: true })`, then only the call under test                            |
| spec                    | the `arrange` fixture — the same recipe as the manual case it automates                                         |

Each test case names its recipe in frontmatter (`setup: { recipe: cart, priceCents: 5000 }`). The recipes are
knowledge too: `bun run qa:arrange --catalog` renders `knowledge/setup/SETUP-RECIPES.md` from the code, so agents
find "how do I get a locked-out account?" with `search_knowledge(scope="setup")`, and the document can't drift.
CI's `qa:arrange --check` fails on a stale catalog or a test case without a valid recipe. A state no recipe builds
comes back as `RECIPE_MISSING`; the fix is a new recipe in code, reviewed.

## Failure triage and the heal guard

A failing test is evidence about the product until proven otherwise. Before anything is edited, each failure is
classified against the vault and a framework-arranged repro (`.claude/rules/failure-triage.md`):

| Class             | Evidence                                                                     | Test edit allowed                             |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `PRODUCT_BUG`     | the app contradicts the rule                                                 | none — defect, then `test.fail` with its id   |
| `INTENDED_CHANGE` | a rule/feature/card already states the new behaviour, changed after the test | expected values follow that document          |
| `TEST_DEFECT`     | the app matches the vault; the locator, wait or data is wrong                | fix to the vault, never to the observed value |
| `UNKNOWN`         | nothing documents the new behaviour                                          | none — a question for Product                 |

A diff of `app/` is never evidence of intent: the code changing is exactly what a bug looks like. `qa/heal-guard.ts`
enforces this mechanically. It compares tests and framework with the base ref and blocks:

- removed or weakened assertions (exact → partial → presence);
- skips (also `test.info().skip()`), a `test.fail` that doesn't pin an open defect the test is tagged with, hard
  waits, timeouts (literal or constant), `configure()`, `toPass()` or retries — compared per occurrence, so a skip
  moved to another test counts;
- a new expected value, changed test data (a price or quantity moved off its boundary) or an API schema change,
  unless `--intended <DOC-ID>` names a document that's on the base branch, unchanged in this diff, and changed after
  the test.

It runs in the agent's job, again in the job that publishes the agent's patch, and in CI, where it blocks
`agentic/*` branches and reports on the rest.

## Hybrid code search

The `codesearch` MCP (`codesearch/`) combines **ripgrep** text hits, ranked by term rarity, with an **import and
symbol graph** that resolves tsconfig aliases and indexes page-object methods. `list_helpers` shows agents the
reusable API helpers, `seed`, recipes and page objects before they write anything new. The index rebuilds when a
file changes, so a long session sees the helpers it just wrote.
