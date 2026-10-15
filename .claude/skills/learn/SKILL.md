---
name: learn
description: Turns human review feedback into durable knowledge — reads PR review comments (gh) or feedback given in the prompt, distills the reusable lessons, and records them in the vault as learnings (add_learning) so future agent runs follow them. Invoke as /learn <PR number | "feedback text">.
argument-hint: "<PR number | \"feedback\">"
---

# Learn from review

1. **Collect feedback.** PR number → `gh pr view <n> --json reviews,comments,files` and `gh api repos/{owner}/{repo}/pulls/<n>/comments` (inline comments with their paths). Text → use it as given.
2. **Distill.** Per comment: is it a one-off fix, or a rule that would apply again (a convention, a pitfall, a domain fact)? Keep only the reusable ones. Rewrite each as guidance: what to do, why, where it applies (paths/globs).
3. **Deduplicate.** `search_knowledge` (`learnings` scope) for each lesson. Same topic → append to that learning (same title in `add_learning`); a domain fact that belongs in a feature or rule → propose the edit to that document instead (show the diff; don't write it — Product owns rules).
4. **Record** with `add_learning(title, lesson, applies_to, source="PR #<n> review")`. Act on any `warnings`.

Final response: lessons recorded (ids, one line each), comments skipped as one-offs, proposed rule/feature edits.
