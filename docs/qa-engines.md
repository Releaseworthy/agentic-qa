# Deterministic QA engines (`qa/`)

The agents call these engines instead of deciding by feel. All of them are unit-tested.

- **Impact analysis** (`qa:impact`). A changed file maps to features through feature cards (`code:`) and reverse
  imports up to 3 hops. A changed rule maps to its feature. A framework change maps to the specs that use its
  classes, fixtures or properties. Risk = criticality × impact weight × change size × open defects. The output is
  the `--grep` CI runs on pull requests. Unknown impact fails safe: product code no feature card maps, the seed's
  admin routes and the test hooks run the whole suite.
- **Traceability** (`qa:trace`). Each feature and rule is matched to its tagged tests, its manual cases with their
  latest manual result, and open defects. Rules nothing verifies, and rules only a manual run verifies, are
  flagged. A `test.fail` pin or a skipped test doesn't count as verifying a rule.
- **Release gate** (`qa:gate`). NO-GO on a failure (automated or manual) in a critical area, an open critical or high
  defect (a fix nobody retested is still open), a critical rule with neither a test nor a passing manual run, or a
  pass rate under 95 %. CONDITIONAL GO when only residual risks remain, each listed with its mitigation; GO
  otherwise. Coverage is judged on the run's results over the full test catalog, so an impact-selected run doesn't
  read as missing tests, and a runtime `test.fail` pin or skip counts as what it is.
- **Seeded-defect detection** (`qa:defects`). Mutation-style: a baseline run on the clean build, then ShopLite starts
  once per seeded defect and the suite runs against it. A defect is caught when a test tagged with the rule it breaks
  goes from green to red. [4 of 4 defects caught](examples/defect-detection.md).
- **Defect triage** (`qa:triage`). Priority = severity × feature criticality (a fixed matrix), release blockers,
  duplicate candidates (same rule, or same feature and a similar title), age, the `@DEF` test that pins it, and the
  next lifecycle step. Metrics: open by severity and feature, which technique finds the bugs, mean open age, reopen
  count.
- **Manual runs** (`qa:manual`). A zod-validated record per manual execution (a case's result must agree with its
  steps; a failure names its defect); the latest result per case feeds traceability and the gate.
- **Flakiness** (`qa:flaky`). From a `--repeat-each` run without retries: failure rate per test and project, stable /
  flaky / broken.
- **Heal guard** (`qa:heal-guard`). Reads every assertion before and after a change: its subject, message, matcher
  strength and expected value. Anything that would turn a red test green without documented intent is blocked
  ([details](framework.md#failure-triage-and-the-heal-guard)).
- **Knowledge guard** (`qa:knowledge-guard`). Every vault change in a diff must be one the knowledge MCP made and
  the ledger records ([details](knowledge.md#self-improving-knowledge)).
- **Vault check** (`qa:vault`). Every document's folder, id pattern, enums and references, in CI; `upsert_document`
  checks the same on write. A defect can't land on a rule's path, and `severity: High` can't silently drop out of
  the gate.

## Commands

| Command                                                  | Does                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `bun run test` / `test:all` / `test:smoke` / `test:unit` | API + Chromium / all browsers / critical path / QA-engine unit tests   |
| `bun run test:staging` / `test:live`                     | The suite against staging / the `@readonly` tests against live         |
| `bun run qa:impact [--base <ref> \| --files <paths>]`    | Change → impacted features, risk, the `--grep` to run                  |
| `bun run qa:trace [--results <path>]`                    | Feature/rule ↔ tests ↔ manual cases ↔ defects                          |
| `bun run qa:gate [--results <path>] [--strict]`          | Go/No-Go from `out/results.json`                                       |
| `bun run qa:defects`                                     | Baseline, then the suite once per seeded defect; fails if one survives |
| `bun run qa:triage [DEF-… \| --all]`                     | Defect board: suggested priority, blockers, duplicates, age, next step |
| `bun run qa:manual [--check <run.json>]`                 | Manual suite progress from `out/manual-runs/`; validates a run record  |
| `bun run qa:flaky`                                       | Flake rate per test from a `--repeat-each` run                         |
| `bun run qa:heal-guard [--base <ref>] [--intended <id>]` | Blocks test changes that hide a failure                                |
| `bun run qa:knowledge-guard [--base <ref>]`              | Blocks vault changes the curation ledger doesn't record                |
| `bun run qa:vault`                                       | Vault frontmatter: folders, ids, severities, statuses, references      |
| `bun run qa:pr-feedback <PR#>`                           | A PR's reviews and comments, from repo members only (for `learn`)      |
| `bun run qa:arrange <recipe> --name s1 [k=v …]`          | A named precondition + its test data + a state for `playwright-cli`    |
| `bun run qa:arrange --case TC-… \| --list \| --check`    | A test case's preconditions / the recipes / catalog and cases in sync  |
| `bun run qa:arrange --stop`                              | Stops the ShopLite `qa:arrange` started in the background              |
| `bun run kb:audit` / `kb:evaluate <proposal.json>`       | Stale/duplicate/unconfirmed learnings / the knowledge gate, dry run    |
| `bun run rag:build` / `rag:eval` / `rag:serve`           | Index the vault / evaluate retrieval / MCP over HTTP                   |
| `bun run rag:test`                                       | Knowledge server and gate tests (pytest)                               |
| `bun run codesearch "apply coupon"`                      | Hybrid code search (also `--symbol`, `--related`, `--helpers`)         |
| `'secret' \| bun run crypto encrypt`                     | An `enc1.…` token for `env/` (`keygen`, `decrypt` too)                 |
| `bun run agent <workflow> [args]`                        | Run a workflow headless (`bun run agent list`)                         |
