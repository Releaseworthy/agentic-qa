---
name: verify-bug
description: Verifies a reported bug for real — checks the expected behaviour in the vault, reproduces it over the API with a scripted repro and in the UI with playwright-cli, isolates the layer, checks for duplicates, and decides CONFIRMED / CANNOT_REPRODUCE / NOT_A_BUG / DUPLICATE / NEEDS_INFO with evidence; a confirmed bug is pinned with a test.fail test. Invoke as /verify-bug <DEF-… | "bug report text"> [--defects <seeded ids>].
argument-hint: "<DEF-… | \"report\"> [--defects <ids>]"
---

# Bug verification

Read `.claude/rules/orchestration.md`, `.claude/rules/browser.md` and `.claude/rules/bug-lifecycle.md` first.

1. **The report:** `get_document <DEF-id>`, or parse the text into steps / expected / actual. `--defects` → a
   practice run: seed sessions get `--defects <ids>`; the last command is `bun run seed:session --name reset --defects none`;
   nothing is written to `knowledge/defects/`.
2. **Expected, in parallel:** `knowledge-scout` — the rule/feature that governs the behaviour (verbatim values,
   codes, messages) and any defect already open on that rule or feature (`bun run qa:triage` lists duplicate candidates).
   No document governs it → `NEEDS_INFO` with the question for Product; stop.
3. **API repro:** write `out/bugs/<id>/repro.ts` (the `@api` helpers and `Seed`, or `fetch`) that sets up the
   start state, makes the call, and prints the request and the response. Run it 3 times with `bun run`.
4. **UI repro:** one `ui-explorer` with the steps, the expected values and a `seed:session` start state; it returns
   what the screen showed, the request/response behind it, and screenshots in `out/bugs/<id>/`.
5. **Verdict:**
   | API | UI | Verdict |
   | --- | --- | --- |
   | contradicts the rule | — | CONFIRMED, `layer: api` (or `both` when the UI shows it too) |
   | matches | contradicts | CONFIRMED, `layer: ui` |
   | matches | matches | CANNOT_REPRODUCE (say what was tried) or NOT_A_BUG (the report misread the rule — cite it) |
   | same rule and symptom as an open defect | | DUPLICATE of it |
   Intermittent → how often, and stays `new`.
6. **Record:** `qa-writer` creates or updates the defect: status (`confirmed` or `rejected` + `resolution`),
   severity, `layer`, evidence paths, History line. `test-reviewer` reviews it.
7. **Pin a confirmed bug:** `test-author` adds the `test.fail(true, 'DEF-…: …')` test at its layer, tagged `@DEF-…`
   and the rule; run it (it must pass while the bug exists).
8. **Reflect:** `.claude/rules/self-improve.md`.

Final response: verdict, layer, the expected (rule id) vs actual (verbatim), repro command and output, screenshots, defect id and status, the pinning test, knowledge proposals.
