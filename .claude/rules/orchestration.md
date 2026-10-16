# Orchestration (skills that delegate)

- **You coordinate; subagents do the work.** Route each kind of work to its agent and keep only the results in your context:
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
- **Isolated context:** give each subagent everything it needs in the prompt (ids, paths, exact titles, what to return) — it can't see this conversation. Ask for compact, structured answers.
- **Reuse, don't respawn:** continue an agent that already holds the context (SendMessage) for follow-ups on the same item.
- **Review loop:** every authored artifact goes to `test-reviewer`. `NEEDS_REVISION` → pass its instructions verbatim to the author, then re-review. At most 2 rounds; still not `PASS` → report the open findings, never ship past them.
- **Stop labels from subagents:** `BLOCKED` (exact blocker) · `PRODUCT_BUG` (the app is wrong: no test edit; route to `qa-writer` for a defect) · `NEEDS_EXPLORATION` (facts missing: route to `ui-explorer`) · `CASE_OUTDATED` (a manual case no longer matches an intended UI: route to `qa-writer` to update it).
- **Self-improve:** every run ends with the reflection in `.claude/rules/self-improve.md` — lessons go through `propose_knowledge`, `knowledge-curator` and `commit_knowledge`, never straight into the vault.
- **Final report:** what was produced (paths), what ran (exact commands, results), decisions and their evidence, open risks — in the shape the skill asks for.
