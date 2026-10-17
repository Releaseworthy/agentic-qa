---
name: ui-qa
description: Post-development UI QA for a feature or card — grounds in the feature card and business rules, seeds data over the API, explores the UI with playwright-cli in parallel isolated sessions, reports defects, then writes manual test cases and automates them as Playwright UI tests. Invoke as /ui-qa <FEAT-id | CARD-id> [focus…].
argument-hint: "<FEAT-… | CARD-…> [focus]"
---

# Post-development UI QA

Read `.claude/rules/orchestration.md` and `.claude/rules/browser.md` first.

1. **Ground** with `knowledge-scout`: the feature's pages, flows, rules with boundaries, error messages, open defects, existing manual cases (`test-cases` scope).
2. **Plan scenarios**: 4–8 charters covering the main flow, each rule's boundaries as seen in the UI, error display, state after reload, navigation (`?next=`), and the focus the caller gave. For each: start state (a framework recipe — `bun run qa:arrange <recipe> …`, `.claude/rules/test-data.md`) and steps.
3. **Explore in parallel**: one `ui-explorer` per 2–3 charters, in one message, each with its own session name and seeded data, the expected results (with DOC-ids) and what to return. Explorers run on the lightweight model; keep their prompts self-contained.
4. **Triage findings**: a real difference from a rule → `qa-writer` writes a defect (`DEF-…`) with the explorer's evidence; a question the vault can't settle → list it for the human; a UI quirk that affects automation (timing, labels) → note for the author.
5. **Manual cases**: `qa-writer` writes one `TC-…` per verified scenario, from the explorer's observed steps — never from expectations alone.
6. **Automate**: `test-author` turns each manual case into a UI test (`tests/ui/<area>.spec.ts`) through page objects, adding page-object actions with the explorers' locators and the requests to wait for; then `qa-writer` sets each case's `automated_by` (only it writes test cases). A `PRODUCT_BUG` → `qa-writer` files the defect, then `test-author` pins the test with its id.
7. **Review**: `test-reviewer` on each case and the spec change (≤ 2 rounds each).
8. **Reflect: `.claude/rules/self-improve.md`.** Reviewer corrections that will recur are the first candidates.

Final response: charters explored (session, result), defects filed (ids, severity), manual cases written, tests added (titles) with the run result, review verdicts, sessions closed.
