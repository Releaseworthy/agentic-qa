---
name: bug-triage
description: Triage meeting for defects. Verifies the unverified, merges duplicates, checks severity against impact, sets priority from the triage engine (severity × feature criticality), finds the suspect code and the owning area, makes sure each confirmed bug is pinned by a test, and decides fix now / next / backlog / won't fix. Writes a triage board. Invoke as /bug-triage [DEF-… | --all-new | --open].
argument-hint: "[DEF-… | --all-new | --open]"
---

# Bug triage

Read `.claude/rules/orchestration.md` and `.claude/rules/bug-lifecycle.md` first.

1. **Board:** `bun run qa:triage [ids]` → `out/triage.json`: per defect the suggested priority, blocker flag, age,
   duplicate candidates, pinning test and next step. Default scope `--open`; `--all-new` = `status: new` only.
2. **Unverified first:** each `new` defect goes through `/verify-bug` (one at a time, or in parallel when they touch
   different features). Its verdict decides whether it stays in triage.
3. **Per remaining defect, decide and write down:**
   - **Duplicate?** Compare with each candidate (same rule, same symptom, same root cause) → `rejected`,
     `resolution: duplicate`, `duplicate_of`.
   - **Severity** re-checked against impact (bug-lifecycle rubric). Change it only with a one-line reason.
   - **Priority** = the engine's suggestion; overriding it needs a reason (e.g. a workaround exists, a release date).
   - **Where:** `code-scout` finds the code path that produces the wrong value (`search_code` with the endpoint and the
     error code) and the feature's `code:` files. That's the owning area and the fix hint.
   - **Pinned?** If there's no `@DEF` test, `test-author` adds the `test.fail` test (bug-lifecycle).
   - **Decision:** P1 → fix before release (blocks the gate if high/critical); P2 → this sprint; P3 → next;
     P4 → backlog; `wont-fix` only with Product's reason (→ `needs_human`).
4. **Record:** `qa-writer` updates each defect (status, severity, priority, History line); `test-reviewer` reviews.
5. **Write** `out/triage/<YYYY-MM-DD>.md`: the board (defect, status, severity, priority, decision, area, pinned by),
   duplicates merged, blockers for the release, metrics from `bun run qa:triage --all` (open by severity, found by,
   mean age).
6. **Reflect:** `.claude/rules/self-improve.md`.

Final response: the board path, decisions per defect, release blockers, duplicates merged, defects that need Product, knowledge proposals.
