# Preconditions and test data (manual runs, bug repros, exploration, smoke, specs)

**Arrange with the framework, act by hand.** The framework builds every start state; an agent performs only the
steps under test. Never click through registration, add-to-cart, coupon setup or checkout to reach a start state,
never invent data, and never re-walk a setup another run already scripted.

1. **Find the recipe.** A test case names it in `setup` (`bun run qa:arrange --case TC-… --name <session>`). Otherwise
   `search_knowledge("<the state you need>", scope="setup")` (`SETUP-RECIPES`) or `bun run qa:arrange --list`.
2. **Arrange it:** `bun run qa:arrange <recipe> --name <session> [param=value …]` — one run per session, so no two
   sessions or agents share data. It prints `user` (email, password), `data` (ids of what it created), `testData`
   and `next`: run those playwright-cli commands to open the state (`state-load` only when signed in), then start
   the steps. `--defects <ids|all|none>` for practice runs against the seeded-defect build.
3. **Type what the output gives you:** cards, addresses and registrations from `testData`, ids from `data`, the
   customer's credentials from `user`. Values a case tests on purpose (a weak password, quantity 11) are the case's.
4. **Scripts arrange the same way:** a repro or probe calls `arrange(request, '<recipe>', { … })` from
   `@setup/recipes`, then makes only the calls under test with the `@api` helpers. Specs use the `arrange` fixture
   (or `seed.*`) — the same recipe as the manual case they automate.
5. **No recipe fits** → build the state in a script from `arrange()`, `Seed` and `@api` (never the UI), and return
   `RECIPE_MISSING: <state> — <how the script built it>`. The caller has `test-author` add the recipe to
   `framework/setup/recipes.ts` (`test-reviewer` reviews), then `bun run qa:arrange --catalog` and
   `bun run rag:build` — the knowledge follows the code. A state the API can't reach is a testability gap: report it.
6. **Read-only environments** (live): only recipes that create nothing (`guest`, `returning-customer`).
