# Self-improvement (every workflow, last step)

Every run ends with a **reflection**. Something only gets into the vault after it passes the gate and an independent judge.

1. **Harvest signals** from this run. Only these count:
   | Signal | Typical lesson |
   | --- | --- |
   | `test-reviewer` returned `NEEDS_REVISION` | what the author got wrong first time |
   | a fix-and-rerun round (test, script, command) | the cause and the fix that worked |
   | `knowledge-scout` said `Unknown:` and the run found out | the missing fact (feature map → proposal; behaviour → human) |
   | the app contradicted the vault | a **defect** and not a lesson, unless the vault is what's wrong (→ proposal for a human) |
   | a tool or environment pitfall (playwright-cli, qa:arrange, env) | the workaround, with why |
   | `RECIPE_MISSING`: a start state had to be scripted by hand | a **recipe** in `framework/setup/recipes.ts` (code, reviewed); the catalog regenerates, so it's not a learning |
   | the heal guard blocked a change | what the failure really was (`.claude/rules/failure-triage.md`) |
   | a human correction in the conversation or a PR | the rule they stated |
   | a provisional learning (`confidence: provisional`) that held, or was wrong | support for it (update) or a deprecation |
2. **Candidates:** at most 3 per run, each reusable beyond this run. A lesson says what to do, why, and where
   (`applies_to` globs). It is never a log of what happened. Finding nothing new is a normal outcome: say so and stop.
3. **Duplicates first:** `search_knowledge(<lesson>, scope="learnings")`. If the topic is the same, make a `kind: update`
   of that id with the merged lesson instead of a second learning.
4. **Propose:** `propose_knowledge(kind, title, body, evidence, source, probe, type?, target?, applies_to?)`.
   Evidence has to be concrete: a test title, a response body path, a screenshot, a reviewer finding, a PR comment.
   `probe` is the question a future agent would ask that this answers.
5. **Judge:** on `decision: judge` or `needs_human`, hand `proposal_id`, the preview, the evidence and the
   neighbours to `knowledge-curator`. Never judge your own proposal (the tool-policy hook refuses
   `commit_knowledge` from anyone else). On `decision: reject`, fix what the
   failed check says once, or drop it.
6. **Report** each candidate in the final response as `<id>: accepted | rejected (why) | needs human (file)`.
   Headless runs also list them under `knowledge` in the structured result.

Never edit `knowledge/learnings/`, `rules/`, `features/`, `cards/` or `product/` by hand (the tool-policy hook refuses
Write/Edit and shell writes into `knowledge/`) or with `upsert_document`; the knowledge guard rejects a vault change
the ledger doesn't record. Test cases and defects are QA artifacts: `qa-writer` writes them, `test-reviewer` reviews them.
