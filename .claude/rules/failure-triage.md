# Failure triage (heal-tests, regression, flaky-hunt, retest-bug, run-testcases, automate-tc)

**The goal is a correct verdict, not a green run.** A failing test is evidence about the product until proven
otherwise. Classify every failure before anything is edited, and edit only what the class allows.

1. **What should happen** — from the vault, now: the rule, feature or card the test tags (`get_document`), with the
   exact values. Not from the test, not from the app, not from the code diff.
2. **What happens** — reproduce the failing check outside the test: arrange its start state with the framework
   (`.claude/rules/test-data.md`) and make the one call over the API (or one `ui-explorer` step). Record it verbatim.
3. **Classify:**

   | Class | When | Allowed edit |
   | --- | --- | --- |
   | `PRODUCT_BUG` | the app contradicts the vault | none — `/verify-bug` flow; the test stays red until a defect is confirmed, then `test.fail(true, 'DEF-…')` |
   | `INTENDED_CHANGE` | the app matches a rule / feature / card that **already says** the new behaviour, on the base branch, changed after the test was | expected values follow that document; assertions keep their strength; list it under `intended` |
   | `TEST_DEFECT` | the app matches the vault; the test is wrong — a stale locator, a missing wait, shared data, a value the vault never said | fix the test or framework to the vault — never to the observed value |
   | `ENVIRONMENT` | app down, env file, credentials, a port | none — fix the environment or report `BLOCKED` |
   | `FLAKY` | passes and fails on the same code | `/flaky-hunt` — find the cause |
   | `UNKNOWN` | the vault is silent or ambiguous, or the change looks deliberate but nothing documents it | none — `needs_human`: a `propose_knowledge` rule/feature update (goes to a human) and the question, verbatim |

4. **Not evidence of intent:** a diff of `app/`, a commit message, the app "looking deliberate", the test being old,
   or the new value seeming reasonable. The code changing is exactly what a bug looks like. Product documents the
   behaviour first; then the test follows.
5. **Never:** remove or weaken an assertion (exact → partial → presence), change an expected value to the observed one
   without a document, skip / fixme / only, `test.fail` without a confirmed defect, a hard wait, a raised timeout or
   retries. `bun run qa:heal-guard --base <ref> [--intended <DOC-ID>]` checks every test change against this table and
   runs again in CI; a blocked change is reverted, not argued with.
6. **Report each failure** as `<test> — <class> — expected <value> (<DOC-ID>), observed <value> — <action taken>`.
