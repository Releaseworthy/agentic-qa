"""Hybrid ranking on the real index (`bun run rag:build` first): derived documents yield to their sources."""

from __future__ import annotations

import pytest

from rag.graph import open_graph
from rag.hybrid import HybridRetriever
from rag.vault import load_vault
from rag.vector import VectorStore


@pytest.fixture(scope="module")
def retriever() -> HybridRetriever:
    return HybridRetriever(load_vault(), VectorStore(), open_graph())


def rank(r: HybridRetriever, q: str, doc_id: str, scope: str | None = None) -> int:
    ids = [x.doc_id for x in r.search(q, k=8, scope=scope)]
    return ids.index(doc_id) if doc_id in ids else 99


def test_a_behaviour_question_ranks_the_rule_above_the_test_case_restating_it(retriever: HybridRetriever) -> None:
    q = "Is shipping free on an order of exactly fifty dollars?"
    assert rank(retriever, q, "BR-SHIP-01") < rank(retriever, q, "TC-CHK-002")


def test_asking_for_test_cases_still_finds_them_first(retriever: HybridRetriever) -> None:
    q = "Which manual test case covers free shipping at exactly $50?"
    assert rank(retriever, q, "TC-CHK-002") < rank(retriever, q, "BR-SHIP-01")
    assert rank(retriever, "free shipping at exactly $50", "TC-CHK-002", scope="test-cases") == 0
