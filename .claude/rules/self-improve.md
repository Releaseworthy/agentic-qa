# Self-improvement (every workflow, last step)

Every run ends with a **reflection**. The vault only gets what passes the gate and an independent judge.

1. **Harvest signals** from this run — only these count:
   | Signal | Typical lesson |
   | --- | --- |
   | `test-reviewer` returned `NEEDS_REVISION` | what the author got wrong first time |
   | a fix-and-rerun round (test, script, command) | the cause and the fix that worked |
   | `knowledge-scout` said `Unknown:` and the run found out | the missing fact (feature map → proposal; behaviour → human) |
   | the app contradicted the vault | a **defect**, not a lesson — unless the vault is what's wrong (→ proposal for a human) |
   | a tool or environment pitfall (playwright-cli, seed, env) | the workaround, with why |
   | a human correction in the conversation or a PR | the rule they stated |
   | a provisional learning (`confidence: provisional`) that held, or was wrong | support for it (update) or a deprecation |
2. **Candidates:** at most 3 per run, each reusable beyond this run. A lesson says what to do, why, and where
   (`applies_to` globs) — never a log of what happened. Nothing new is a normal outcome: say so and stop.
3. **Duplicates first:** `search_knowledge(<lesson>, scope="learnings")`. Same topic → `kind: update` of that id
   with the merged lesson, not a second learning.
4. **Propose:** `propose_knowledge(kind, title, body, evidence, source, probe, type?, target?, applies_to?)`.
   Evidence is concrete — a test title, a response body path, a screenshot, a reviewer finding, a PR comment.
   `probe` is the question a future agent would ask that this answers.
5. **Judge:** `decision: judge` or `needs_human` → hand `proposal_id`, the preview, the evidence and the
   neighbours to `knowledge-curator` (never judge your own proposal). `decision: reject` → fix what the
   failed check says once, or drop it.
6. **Report** each candidate in the final response: `<id> — accepted | rejected (why) | needs human (file)`;
   headless runs also list them under `knowledge` in the structured result.

Never edit `knowledge/learnings/`, `rules/`, `features/`, `cards/` or `product/` by hand or with
`upsert_document`. Test cases and defects are QA artifacts: `qa-writer` writes them, `test-reviewer` reviews them.
