---
name: release-gate
description: Go/No-Go release assessment — combines test results, coverage gaps, unresolved defects, business impact and residual risk into a decision with blockers and required mitigations, written for human sign-off. Invoke as /release-gate [--results <path>] [--release <name>].
argument-hint: "[--results <path>] [--release <name>]"
---

# Go/No-Go assessment

1. **Evidence**: results from `--results` or `out/results.json` (run `bun run test` first when missing or older than the last commit). Then `bun run qa:gate [--results <path>]` and `bun run qa:trace --results <path>`; read `out/release-gate.json` and `out/traceability.json`. If `out/impact.json` exists, it says what this release changed.
2. **Interpret, don't override.** The engine's decision follows fixed rules (see `qa/release-gate.ts`). Your job is the narrative a human signs off on:
   - Each blocker: business impact in one sentence (which customers, which money/data), the owner, the mitigation required.
   - Each residual risk: likelihood × impact given what changed, and whether a release note, a monitoring check or a follow-up ticket covers it.
   - Coverage: changed features with thin automation, rules covered only manually.
   - Defects: open ones by severity with the decision they need (fix / accept / defer).
3. **Ask `knowledge-scout`** only for context the reports lack (what a defect affects, what a feature's criticality means).
4. **Write** `out/release/<release or date>.md`: decision (as the engine says), summary for a non-technical reader, blockers, risks with mitigations, evidence links (report paths, test counts), sign-off checklist.

Never turn a NO-GO into a GO. If you believe the rules misjudge a case, say so under "Reviewer note" — the human decides.

Final response: the decision, blockers and required mitigations, the report path.
