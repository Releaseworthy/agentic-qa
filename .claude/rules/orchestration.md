# Orchestration (skills that delegate)

- **You coordinate and subagents do the work.** Route each kind of work to its agent and keep only the results in your context:
  | Work | Agent | Model |
  | --- | --- | --- |
  | business facts from the vault | `knowledge-scout` | haiku |
  | existing helpers, page objects, fixtures | `code-scout` | haiku |
  | driving the browser | `ui-explorer` | haiku |
  | writing specs, page objects, helpers | `test-author` | opus |
  | reviewing an artifact | `test-reviewer` | opus |
  | manual test cases, defect reports and their lifecycle | `qa-writer` | sonnet |
  | executing a manual test case step by step | `manual-tester` | haiku |
  | judging a knowledge proposal | `knowledge-curator` | sonnet |
- **Parallel when independent:** knowledge, code and exploration questions that don't depend on each other go out in one message. Each explorer gets its own session name and its own seeded data.
- **Isolated context:** a subagent can't see this conversation, so give it everything it needs in the prompt (ids, paths, exact titles, what to return). Ask for compact, structured answers.
- **Reuse instead of respawning:** for follow-ups on the same item, continue the agent that already holds the context (SendMessage).
- **Review loop:** every authored artifact goes to `test-reviewer`. On `NEEDS_REVISION`, pass its instructions verbatim to the author, then re-review. At most 2 rounds. If it's still not `PASS`, report the open findings and never ship past them.
- **Stop labels from subagents:** `BLOCKED` (exact blocker) · `PRODUCT_BUG` (the app is wrong: no test edit; route to `qa-writer` for a defect, then `test-author` pins the test with its `DEF-…` id) · `NEEDS_EXPLORATION` (facts missing: route to `ui-explorer`) · `CASE_OUTDATED` (a manual case no longer matches a UI change a rule/feature/card documents: route to `qa-writer` to update it) · `RECIPE_MISSING` (a precondition no framework recipe builds: route to `test-author` for a recipe in `framework/setup/recipes.ts`, then `bun run qa:arrange --catalog`).
- **Preconditions and data** come from the framework (`.claude/rules/test-data.md`). Give every explorer and tester the recipe (`bun run qa:arrange <recipe> …` or `--case TC-…`) instead of a description of a setup to click through.
- **A failing test needs a verdict** (`.claude/rules/failure-triage.md`) before anyone edits it; `bun run qa:heal-guard` checks every test change.
- **Self-improve:** every run ends with the reflection in `.claude/rules/self-improve.md`. Lessons go through `propose_knowledge`, `knowledge-curator` and `commit_knowledge`, never straight into the vault.
- **Final report:** what was produced (paths), what ran (exact commands, results), decisions and their evidence, and open risks, in the shape the skill asks for.
