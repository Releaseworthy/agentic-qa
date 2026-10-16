---
name: learn
description: The human-feedback half of the self-improvement loop — mines a pull request (review comments, and for an agent-written PR the edits humans made to the agent's output before merging) or feedback text for reusable lessons, and runs each through the knowledge gate and the independent curator; --audit re-validates the existing learnings (stale, unconfirmed, duplicate) instead. Invoke as /learn <PR number | "feedback" | --audit>.
argument-hint: "<PR number | \"feedback\" | --audit>"
---

# Learn from humans

Read `.claude/rules/orchestration.md` and `.claude/rules/self-improve.md` first.

1. **Collect feedback.**
   - PR → `gh pr view <n> --json title,headRefName,author,reviews,comments,files,commits` and
     `gh api repos/{owner}/{repo}/pulls/<n>/comments` (inline comments with path and line).
   - **Agent-written PR** (branch `agentic/*`, or the first commit by `github-actions[bot]`): the human edits are
     the strongest signal. `git diff <agent's last commit> <merge head> -- tests framework knowledge` — every hunk
     a human changed in the agent's output is a correction, even with no comment on it.
   - Text → as given.
   - `--audit` → `bun run kb:audit` (stale `applies_to`, provisional learnings no second source confirmed in 60
     days, near-duplicate pairs, broken links, proposals waiting for a human); go to 3 with each finding.
2. **Distill.** Per comment or human edit: a one-off fix, or a rule that would apply again (a convention, a pitfall,
   a domain fact)? Keep the reusable ones. Group edits that say the same thing. Each lesson: what to do, why, and
   where (`applies_to` globs).
3. **Propose** each (self-improve steps 3–5):
   - lesson → `propose_knowledge` (`kind: update` when `search_knowledge(scope="learnings")` finds the topic);
     evidence `pr-comment` / `review` (with the comment URL or path:line) or `human` — human evidence makes it
     `established`;
   - a domain fact → `type: feature | rule` proposal: the gate files it for Product (`needs_human`);
   - audit findings → stale scope: `update` with the moved paths, or `deprecate`; duplicates: `update` one with the
     merged lesson + `deprecate` the other; provisional with no support in 60 days: `deprecate`, unless this PR
     supports it (`update` → support +1).
   Then `knowledge-curator` judges every proposal with `decision: judge | needs_human`.
4. **Check the loop closed:** `bun run rag:eval` — the golden set plus learned probes must still pass.

Final response: lessons accepted (ids, one line each), rejected (why), filed for a human (paths), comments skipped as one-offs, the eval result.
