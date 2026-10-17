# Agents

Each workflow is a **skill** (`.claude/skills/*/SKILL.md`). The skill coordinates and hands the work to
**subagents** (`.claude/agents/*.md`), each with its own context window and only the tools it needs. Project rules
live in `CLAUDE.md` and `.claude/rules/`. Run a workflow as `/skill` in Claude Code, or headless with
`bun run agent <name>`.

## Workflows

| QA activity              | Workflow                                                                                            | Backed by                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Plan**                 |                                                                                                     |                                                                                   |
| Risk-based test planning | `qa-plan` — impacted areas ranked by risk, coverage, exit criteria                                  | `qa/impact.ts`, vault, code graph                                                 |
| AC refinement            | `refine-ac CARD-142` — ambiguities, rule conflicts, Given/When/Then, questions for Product          | knowledge MCP · [example](examples/refine-ac-CARD-142.md)                         |
| **Manual testing**       |                                                                                                     |                                                                                   |
| Preconditions and data   | every start state from a named framework recipe — `qa:arrange cart priceCents=5000`, `--case TC-…`  | `framework/setup/recipes.ts` → `SETUP-RECIPES` knowledge                          |
| Test-case design         | `write-testcases BR-COUP-02` — boundaries, decision tables, state transitions; no duplicates        | `knowledge/test-cases/` (16 cases)                                                |
| Manual execution         | `run-testcases FEAT-CART` — arranges each case with its recipe, then only its steps, with evidence  | `manual-tester` ×N, `qa/manual-runs.ts` → trace and gate                          |
| Manual → automated       | `automate-tc --unautomated` — case steps become named `test.step`s, `automated_by` linked           | page objects, `arrange` (the case's recipe)                                       |
| **Automated testing**    |                                                                                                     |                                                                                   |
| Endpoint API tests       | `api-testgen "PATCH /api/cart/items/:productId"` — positive + negative per endpoint                 | API helpers, `seed`, rule boundaries                                              |
| API journey tests        | `api-journey-testgen "two customers race for the last units"` — chained calls, final business state | `tests/api/journeys/`                                                             |
| Post-dev UI QA           | `ui-qa FEAT-CART` — explore in parallel sessions, defects, manual cases, then Playwright specs      | `playwright-cli`, page objects                                                    |
| Ad hoc testing           | `adhoc-test "<charter>" [--defects]` — unscripted, evidence, minimal repro                          | `qa:arrange`, `playwright-cli` · [example](examples/adhoc-test-seeded-defects.md) |
| **Bugs**                 |                                                                                                     |                                                                                   |
| Bug verification         | `verify-bug DEF-007` — API repro script + UI repro, layer, verdict, pinned by a `test.fail` test    | `out/bugs/<id>/`, `playwright-cli`                                                |
| Bug triage               | `bug-triage --open` — verify, dedupe, severity, priority, suspect code, decision                    | `qa/defects.ts` (`qa:triage`)                                                     |
| Retest after a fix       | `retest-bug DEF-007` — repro again, pinning test → regression test, close or reopen                 | `qa/impact.ts`                                                                    |
| **Maintenance**          |                                                                                                     |                                                                                   |
| Impact-based regression  | `regression --base origin/main` — select, run, triage flaky / test defect / product bug             | `qa/impact.ts` · [example](examples/impact-pricing-change.md)                     |
| Flaky tests              | `flaky-hunt` — `--repeat-each` without retries, rate per test, root cause, fix, prove               | `qa/flaky.ts` (`qa:flaky`)                                                        |
| Test maintenance         | `heal-tests --card CARD-157` — classify each failure first; heal only documented changes            | `qa/heal-guard.ts` (`qa:heal-guard`), vault rules/cards                           |
| **Release**              |                                                                                                     |                                                                                   |
| Post-deploy smoke        | `smoke-check --env staging` — health, `@smoke`, critical pages by eye, PASS/FAIL                    | env profiles, saved accounts                                                      |
| Test summary report      | `test-report --period sprint` — execution, coverage, defects, risks for stakeholders                | every `qa:*` report                                                               |
| Go/No-Go                 | `release-gate` — blockers, residual risks, sign-off                                                 | `qa/release-gate.ts` · [example](examples/release-gate.md)                        |
| **Self-improvement**     |                                                                                                     |                                                                                   |
| Reflection, every run    | the last step of every workflow — lessons proposed, gated, judged by another agent                  | `propose_knowledge` → `knowledge-curator` → `commit_knowledge`                    |
| Learning from humans     | `learn <PR#>` / `learn --audit` — review comments and human edits to agent PRs; stale lessons       | runs on every merged PR                                                           |

## Subagents and model routing

| Subagent            | Model  | Does                                                                                      |
| ------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `knowledge-scout`   | haiku  | Business facts with document ids, from the knowledge MCP                                  |
| `code-scout`        | haiku  | Existing helpers, page objects and fixtures to reuse                                      |
| `ui-explorer`       | haiku  | Drives its own headless `playwright-cli` session, records labels, network calls, evidence |
| `test-author`       | opus   | Writes specs and page objects, validates with a focused run, typecheck and lint           |
| `test-reviewer`     | opus   | Read-only verdict, PASS / NEEDS_REVISION, at most 2 revision rounds                       |
| `qa-writer`         | sonnet | Manual test cases and defect reports with their lifecycle, written into the vault         |
| `manual-tester`     | haiku  | Follows a manual test case step by step in its own browser, verdict + evidence per step   |
| `knowledge-curator` | sonnet | Independent judge of knowledge proposals: scores them on 5 criteria, commits the verdict  |

Lookups and browser exploration run on the light model; orchestration, authoring and review on the strongest.
Independent explorers run in parallel, each with its own seeded data and browser session.

## Tool policy

Each subagent gets only the knowledge tools its role needs (read-only for the scouts, explorers and reviewer). A
PreToolUse hook (`agents/tool-policy.ts`, wired in `.claude/settings.json`) applies the same rules to every session,
interactive or headless:

| Rule                                                                                    | Why                                                              |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| only `knowledge-curator` calls `commit_knowledge`                                       | the proposer can't judge its own lesson                          |
| only `qa-writer` calls `upsert_document`                                                | test cases and defects have one author, reviewed                 |
| the vault changes only through the knowledge MCP — no Write/Edit or shell write into it | nothing reaches `knowledge/` past the gate and the judge         |
| a headless run writes only `tests/`, `framework/`, `out/`                               | it can't edit the app, the engines that check it, or this policy |
| `gh` read-only (a plain GET); PR comments only via `qa:pr-feedback`                     | anyone can comment on a public repo — outsiders are filtered out |
| no `git push`/`commit`/`fetch`, no network beyond localhost, no reading credentials     | an injected instruction can't publish or leak                    |

Commands are checked one by one — through pipes, `&&`, `$(…)`, `bash -c`, `xargs` and redirects — and a call the
hook can't read is refused. It is not a sandbox: an agent that writes and runs a script can do more. In CI the agent
job therefore has a read-only GitHub token, and a separate job re-checks and publishes its patch
([CI](ci.md#agentic-qa)).

## Headless runner

`agents/run.ts` runs the same skills through the **Claude Agent SDK**: the project's settings, skills, subagents and
MCP servers, a spend cap and a turn cap (validated — a typo fails the run instead of lifting the cap), and
pre-approved tools only. It returns a zod-defined result CI acts on (a run without one fails) and saves a transcript
plus cost and per-model usage to `out/agent-runs/<id>/`.

```bash
bun run agent list
bun run agent refine-ac CARD-142 --budget 2
bun run agent release-gate --strict      # exit 1 on NO-GO
```

## Real runs

| Run                                              | Result                                                                                                                                                                                                                                                                         | Cost  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `refine-ac CARD-142`                             | 13 questions for Product with proposed defaults, 8 Given/When/Then criteria with boundaries, and conflicts found with the free-shipping and discount-cap rules. Passed review on round 2. [Output](examples/refine-ac-CARD-142.md) · [run](examples/refine-ac-CARD-142.run.md) | $1.17 |
| `adhoc-test "<cart and order totals>" --defects` | Haiku explorers in 5 parallel browser sessions found **all 4 planted defects**, each confirmed with an API repro and screenshots. [Notes](examples/adhoc-test-seeded-defects.md) · [run](examples/adhoc-test-seeded-defects.run.md)                                            | $0.77 |
| `learn "<review feedback>"`                      | The full self-improvement loop: no duplicate found, gate passed, the probe ranked the lesson first, the independent curator scored it 4–5 and committed it, and its probe joined the golden set. [Walkthrough](examples/learn-review-feedback.md)                              | $0.53 |
| `learn "<second review feedback>"`               | The gate refused a near-duplicate of `LRN-SCOPE` (0.668 similarity); the agent re-proposed it as an update, the curator accepted it, and the knowledge guard matched the file to its ledger line. [Walkthrough](examples/learn-pin-with-defect-id.md)                          | $0.68 |
