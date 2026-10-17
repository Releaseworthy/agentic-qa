# Failure triage (heal-tests, regression, flaky-hunt, retest-bug, run-testcases, automate-tc)

**What you're after is the correct verdict, even if the run stays red.** Treat a failing test as evidence about the
product until it's proven otherwise. Classify every failure before anything is edited, and edit only what the class allows.

1. **What should happen:** take it from the vault, now. That means the rule, feature or card the test tags
   (`get_document`), with the exact values. Don't take it from the test, the app or the code diff.
2. **What happens:** reproduce the failing check outside the test. Arrange its start state with the framework
   (`.claude/rules/test-data.md`) and make the one call over the API (or one `ui-explorer` step). Record it verbatim.
3. **Classify:**

   | Class | When | Allowed edit |
   | --- | --- | --- |
   | `PRODUCT_BUG` | the app contradicts the vault | none. Use the `/verify-bug` flow; the test stays red until a defect is confirmed, then `test.fail(true, 'DEF-…')` |
   | `INTENDED_CHANGE` | the app matches a rule / feature / card that **already says** the new behaviour, on the base branch, changed after the test was | expected values follow that document; assertions keep their strength; list it under `intended` |
   | `TEST_DEFECT` | the app matches the vault and the test is wrong: a stale locator, a missing wait, shared data, a value the vault never said | fix the test or framework to match the vault, never to match the observed value |
   | `ENVIRONMENT` | app down, env file, credentials, a port | none. Fix the environment or report `BLOCKED` |
   | `FLAKY` | passes and fails on the same code | `/flaky-hunt` to find the cause |
   | `UNKNOWN` | the vault is silent or ambiguous, or the change looks deliberate but nothing documents it | none. Mark `needs_human`: a `propose_knowledge` rule/feature update (goes to a human) and the question, verbatim |

4. **Not evidence of intent:** a diff of `app/`, a commit message, the app "looking deliberate", the test being old,
   or the new value seeming reasonable. A code change is also exactly what a bug looks like. Product documents the
   behaviour first, and only then does the test follow.
5. **Never:** remove or weaken an assertion (exact → partial → presence), change an expected value to the observed one
   without a document, change the test data (a price, quantity or code) so the test no longer reaches its boundary,
   skip / fixme / only (also `test.info().skip()`), `test.fail` without a confirmed defect the test is tagged with, a
   hard wait, a timeout (literal or constant), `configure()`, `toPass()` or retries. `bun run qa:heal-guard --base <ref>
   [--intended <DOC-ID>]` checks every test change against this table and runs again in CI. A blocked change gets
   reverted; don't argue with it.
6. **Report each failure** as `<test> | <class> | expected <value> (<DOC-ID>), observed <value> | <action taken>`.
