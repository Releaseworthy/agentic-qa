"""The knowledge gate: deterministic checks, the judge's bar, and the commit path (on a throwaway ledger)."""

from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from rag import curate
from rag.vault import Document, load_vault, parse

TODAY = date(2026, 10, 16)
SCORES = {"grounded": 5, "reusable": 4, "actionable": 4, "scoped": 4, "consistent": 5}


def proposal(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "kind": "add",
        "type": "learning",
        "title": "Run playwright-cli state-load after open",
        "body": "- `open <baseUrl>` first, then `state-load`, then `goto`: state only restores for an open origin.\n"
        "- Why: the SPA reads its token from localStorage on every route.",
        "evidence": [{"kind": "review", "ref": "PR #9 review", "quote": "state-load before open signs you out"}],
        "source": "PR #9 review",
        "probe": "In which order do I open, state-load and goto with playwright-cli?",
        "applies_to": [".claude/rules/browser.md"],
    }
    return {**base, **over}


@pytest.fixture(scope="module")
def docs() -> list[Document]:
    return load_vault()


@pytest.fixture
def sandbox(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(curate, "CURATION_DIR", tmp_path / "_curation")
    monkeypatch.setattr(curate, "LEDGER", tmp_path / "_curation" / "ledger.jsonl")
    monkeypatch.setattr(curate, "PROPOSALS_DIR", tmp_path / "_curation" / "proposals")
    monkeypatch.setattr(curate, "PENDING_DIR", tmp_path / "pending")
    monkeypatch.setattr(curate, "LEARNED", tmp_path / "golden.learned.yaml")
    return tmp_path


def doc_of(raw: dict[str, Any], docs: list[Document]) -> Document:
    _, path, content = curate._resolve(curate.Proposal.from_dict(raw), {d.id: d for d in docs}, TODAY)
    return parse(curate.ROOT / path, content)


class TestChecks:
    def test_a_lesson_that_narrates_a_run_is_refused(self, docs: list[Document]) -> None:
        raw = proposal(body="- In this run I found the cart flaky; added a wait.")
        check = curate.check_shape(curate.Proposal.from_dict(raw), doc_of(raw, docs), {d.id: d for d in docs})
        assert not check.ok and "run log" in check.detail

    def test_a_probe_must_be_a_question(self, docs: list[Document]) -> None:
        raw = proposal(probe="state-load order")
        check = curate.check_shape(curate.Proposal.from_dict(raw), doc_of(raw, docs), {d.id: d for d in docs})
        assert not check.ok and "probe" in check.detail

    def test_evidence_is_required_and_cited_files_must_exist(self) -> None:
        assert not curate.check_evidence(curate.Proposal.from_dict(proposal(evidence=[]))).ok
        missing = curate.check_evidence(
            curate.Proposal.from_dict(proposal(evidence=[{"kind": "screenshot", "ref": "out/evidence/nope.png"}]))
        )
        assert not missing.ok and "does not exist" in missing.detail

    def test_applies_to_must_match_files(self, docs: list[Document]) -> None:
        raw = proposal(applies_to=["framework/nowhere/**"])
        check = curate.check_scope(curate.Proposal.from_dict(raw), doc_of(raw, docs))
        assert not check.ok and "matches no file" in check.detail

    def test_rules_go_to_a_human_and_test_cases_are_refused(self, docs: list[Document]) -> None:
        by_id = {d.id: d for d in docs}
        rule = (curate.ROOT / by_id["BR-SHIP-01"].path).read_text(encoding="utf-8").replace("$4.99", "$5.99")
        raw = proposal(kind="update", type="rule", target="BR-SHIP-01", title="Free shipping from $50", body=rule)
        check, human = curate.check_ownership(curate.Proposal.from_dict(raw), doc_of(raw, docs), by_id)
        assert check.ok and human
        tc = proposal(type="test-case", body="---\nid: TC-X-001\ntype: test-case\n---\n# x")
        check, human = curate.check_ownership(curate.Proposal.from_dict(tc), parse(Path("x.md"), tc["body"]), by_id)
        assert not check.ok and not human

    def test_the_generated_setup_catalog_is_refused(self, docs: list[Document]) -> None:
        by_id = {d.id: d for d in docs}
        text = (curate.ROOT / by_id["SETUP-RECIPES"].path).read_text(encoding="utf-8")
        raw = proposal(kind="update", type="setup", target="SETUP-RECIPES", title="Recipes", body=text + "\nmore")
        check, human = curate.check_ownership(curate.Proposal.from_dict(raw), doc_of(raw, docs), by_id)
        assert not check.ok and not human and "recipes.ts" in check.detail

    def test_a_feature_map_change_is_agent_owned_but_behaviour_is_not(self, docs: list[Document]) -> None:
        by_id = {d.id: d for d in docs}
        text = (curate.ROOT / by_id["FEAT-CATALOG"].path).read_text(encoding="utf-8")
        mapped = text.replace("code: [app/domain/catalog.ts, app/routes/products.ts]", "code: [app/domain/catalog.ts, app/routes/products.ts, app/http.ts]")
        raw = proposal(kind="update", type="feature", target="FEAT-CATALOG", title="Catalog", body=mapped)
        assert curate.check_ownership(curate.Proposal.from_dict(raw), doc_of(raw, docs), by_id) [1] is False
        behaviour = text.replace("case-insensitively", "case-sensitively")
        raw = proposal(kind="update", type="feature", target="FEAT-CATALOG", title="Catalog", body=behaviour)
        assert curate.check_ownership(curate.Proposal.from_dict(raw), doc_of(raw, docs), by_id)[1] is True


class TestJudgeBar:
    def test_clears_with_every_score_at_least_3_and_a_mean_of_4(self) -> None:
        assert curate.judge_bar(SCORES) is None

    @pytest.mark.parametrize(
        ("scores", "why"),
        [
            ({**SCORES, "grounded": 2}, "below 3"),
            ({c: 3 for c in curate.CRITERIA}, "mean"),
            ({"grounded": 5}, "missing"),
        ],
    )
    def test_refuses(self, scores: dict[str, int], why: str) -> None:
        assert why in (curate.judge_bar(scores) or "")


class TestLearningProvenance:
    def test_a_human_sourced_lesson_is_established_an_agent_one_provisional(self) -> None:
        p = curate.Proposal.from_dict(proposal())
        assert "confidence: established" in curate.render_learning("LRN-X", p, None, TODAY)
        agent = curate.Proposal.from_dict(proposal(evidence=[{"kind": "test-run", "ref": "tests/ui/cart.spec.ts"}], source="regression run"))
        text = curate.render_learning("LRN-X", agent, None, TODAY)
        assert "confidence: provisional" in text and "support: 1" in text

    def test_a_second_independent_source_raises_support_and_establishes_it(self) -> None:
        agent = curate.Proposal.from_dict(proposal(evidence=[{"kind": "test-run", "ref": "tests/ui/cart.spec.ts"}], source="regression run"))
        first = parse(Path("LRN-X.md"), curate.render_learning("LRN-X", agent, None, TODAY))
        again = curate.Proposal.from_dict(proposal(evidence=[{"kind": "test-run", "ref": "tests/ui/cart.spec.ts"}], source="ui-qa run"))
        second = parse(Path("LRN-X.md"), curate.render_learning("LRN-X", again, first, TODAY))
        assert second.meta["support"] == 2 and second.meta["confidence"] == "established"
        same = parse(Path("LRN-X.md"), curate.render_learning("LRN-X", agent, first, TODAY))
        assert same.meta["support"] == 1, "the same source repeating itself is not independent support"

    def test_a_lesson_that_opens_with_its_title_shows_it_once(self) -> None:
        p = curate.Proposal.from_dict(proposal(body="# Run playwright-cli state-load after open\n\n- open first."))
        assert curate.render_learning("LRN-X", p, None, TODAY).count("# Run playwright-cli") == 1

    def test_ids_are_cut_at_a_word_boundary(self) -> None:
        lid = curate.learning_id("Never write TypeScript through double-quoted PowerShell strings")
        assert lid == "LRN-NEVER-WRITE-TYPESCRIPT-THROUGH-DOUBLE"
        assert curate.learning_id("Waits") == "LRN-WAITS"


class TestGateEndToEnd:
    """Real embeddings on a throwaway index; the live index is not touched."""

    def test_a_paraphrase_of_an_existing_learning_is_rejected_as_a_duplicate(self, docs: list[Document]) -> None:
        raw = proposal(
            title="Page objects wait for the API response behind an action",
            body="- Every page-object action that calls the API waits for that response (`page.waitForResponse` set up "
            "before the click), never for a fixed time.\n- Navigation waits for `body[data-ready]`, not `networkidle`.\n"
            "- Never fix flakiness by raising a timeout.",
            probe="What should a page-object action wait for after a click?",
            applies_to=["framework/pages/**"],
        )
        ev, _, _ = curate.evaluate(raw, docs, TODAY)
        novelty = next(c for c in ev.checks if c.name == "novelty")
        assert ev.decision == "reject" and not novelty.ok and "LRN-UI-WAITS" in novelty.detail

    def test_a_new_lesson_passes_to_the_judge_and_its_probe_finds_it(self, docs: list[Document]) -> None:
        ev, _, _ = curate.evaluate(proposal(), docs, TODAY)
        assert ev.decision == "judge", [c for c in ev.checks if not c.ok]
        assert ev.retrieval["lost"] == [] and ev.retrieval["probe_rank"] is not None

    def test_deprecating_a_document_the_golden_set_needs_is_rejected(self, docs: list[Document]) -> None:
        raw = proposal(kind="deprecate", target="LRN-TEST-DATA", title="Test data", body="superseded")
        ev, _, _ = curate.evaluate(raw, docs, TODAY)
        retrieval = next(c for c in ev.checks if c.name == "retrieval")
        assert ev.decision == "reject" and "no longer answered" in retrieval.detail


class TestCommit:
    def test_accept_writes_the_document_records_the_ledger_and_learns_the_probe(self, docs: list[Document], sandbox: Path) -> None:
        raw = proposal()
        ev, _, _ = curate.evaluate(raw, docs, TODAY)
        curate.save_pending(ev, raw)
        out = curate.decide(ev.proposal_id, "accept", SCORES, "grounded in review", "test")
        assert out.decision == "accepted" and out.write and out.write[0].endswith(f"{ev.doc_id}.md")
        assert ev.doc_id in (sandbox / "golden.learned.yaml").read_text(encoding="utf-8")
        assert '"decision": "accepted"' in (sandbox / "_curation" / "ledger.jsonl").read_text(encoding="utf-8")

    def test_learned_probes_are_written_the_way_prettier_formats_yaml(self, docs: list[Document], sandbox: Path) -> None:
        # CI runs `prettier --check` on rag/: an accepted lesson must not fail the agent's pull request.
        curate.add_probe("Which order do open, state-load and goto go in?", "LRN-X", "PROP-20261017-aaaaaa")
        text = (sandbox / "golden.learned.yaml").read_text(encoding="utf-8")
        assert "  expected:\n    - LRN-X\n" in text, text

    def test_the_ledger_sha_is_the_sha_of_the_file_written(self, docs: list[Document], sandbox: Path) -> None:
        # qa/knowledge-guard.ts matches a vault file in an agent's patch to the decision that accepted it.
        raw = proposal()
        ev, _, _ = curate.evaluate(raw, docs, TODAY)
        curate.save_pending(ev, raw)
        out = curate.decide(ev.proposal_id, "accept", SCORES, "grounded in review", "test")
        assert out.write is not None
        content = out.write[1]
        assert content.endswith("\n") and "\r" not in content
        assert out.ledger["sha"] == hashlib.sha256(content.encode("utf-8")).hexdigest()[:12]
        assert curate.content_sha(content.replace("\n", "\r\n")) == out.ledger["sha"], "CRLF does not change the sha"

    def test_an_accept_below_the_bar_is_recorded_as_rejected(self, docs: list[Document], sandbox: Path) -> None:
        raw = proposal()
        ev, _, _ = curate.evaluate(raw, docs, TODAY)
        curate.save_pending(ev, raw)
        out = curate.decide(ev.proposal_id, "accept", {**SCORES, "reusable": 2}, "one-off", "test")
        assert out.decision == "rejected" and out.write is None

    def test_a_failed_gate_cannot_be_overruled_by_the_judge(self, docs: list[Document], sandbox: Path) -> None:
        raw = proposal(evidence=[])
        ev, _, _ = curate.evaluate(raw, docs, TODAY)
        curate.save_pending(ev, raw)
        assert curate.decide(ev.proposal_id, "accept", SCORES, "looks fine", "test").decision == "rejected"

    def test_a_rule_change_is_filed_for_a_human_not_written(self, docs: list[Document], sandbox: Path) -> None:
        by_id = {d.id: d for d in docs}
        rule = (curate.ROOT / by_id["BR-COUP-01"].path).read_text(encoding="utf-8").replace(
            "removes it.", "removes it. Applying the same code again is a no-op."
        )
        raw = proposal(kind="update", type="rule", target="BR-COUP-01", title="One coupon per cart", body=rule,
                       probe="What happens when the same coupon is applied twice?")
        ev, _, _ = curate.evaluate(raw, docs, TODAY)
        assert ev.decision == "needs_human", [c for c in ev.checks if not c.ok]
        curate.save_pending(ev, raw)
        out = curate.decide(ev.proposal_id, "accept", SCORES, "observed in the API", "test")
        assert out.decision == "needs-human" and out.write is None and out.proposal_file
        assert "Applying the same code again is a no-op." in Path(curate.ROOT / out.proposal_file).read_text(encoding="utf-8")
