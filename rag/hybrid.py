"""Hybrid retrieval: vector search and graph traversal, fused with reciprocal-rank fusion.

1. Vector: the query's nearest chunks, collapsed to documents (best chunk wins).
2. Graph: seeds are the ids the query names (`BR-SHIP-01`), documents whose title
   shares words with the query, and the top vector documents; their neighbours are
   ranked by edge weight × seed strength.
3. Fusion: score = Σ 1 / (RRF_K + rank) over both lists, so a document both
   retrievers agree on rises to the top, and one only the graph knows (the rules
   of a feature the query never names) still gets in.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from rag.config import RRF_K
from rag.graph import GraphStore
from rag.vault import Document, is_active
from rag.vector import VectorStore

Mode = Literal["hybrid", "vector", "graph"]
ID = re.compile(r"\b((?:FEAT|BR|DEF|CARD|TC|LRN|SETUP)-[A-Z0-9-]+)\b", re.IGNORECASE)
WORD = re.compile(r"[a-z0-9]+")
STOP = set("a an the of to in on for and or is are be by with what which how when does do can i my".split())
SCOPES: dict[str, list[str]] = {
    "wiki": ["feature", "rule", "overview", "card", "defect"],
    "rules": ["rule"],
    "features": ["feature"],
    "test-cases": ["test-case"],
    "learnings": ["learning"],
    "defects": ["defect"],
    "cards": ["card"],
    "setup": ["setup"],
}


@dataclass
class Result:
    doc_id: str
    title: str
    type: str
    path: str
    score: float
    via: list[str]
    section: str = ""
    text: str = ""
    related: list[str] = field(default_factory=list)


# Words that say what kind of document is wanted: those documents form a fourth ranked list.
INTENT: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\btest ?cases?\b|\bmanual (test|case)", re.I), "test-case"),
    (re.compile(r"\b(defects?|bugs?|known issues?)\b", re.I), "defect"),
    (re.compile(r"\b(card|story|unclear|refine|acceptance criteria)\b", re.I), "card"),
    (re.compile(r"\b(should (tests?|we)|best practice|lesson|review feedback)\b", re.I), "learning"),
    (re.compile(r"\b(endpoints?|pages?|code|which rules)\b", re.I), "feature"),
    (re.compile(r"\b(preconditions?|start state|set ?up|test data|arrange|recipes?|seed(ed|ing)?|manual run|how do i (get|create|make))\b", re.I), "setup"),
]


# Documents that restate others: a manual case repeats its rule's values step by step, and the setup catalog names the
# rules each recipe serves, so both out-score the rule for "what happens when…" questions. Unless the query asks for
# them, they rank below their sources.
DERIVED_WEIGHT: dict[str, float] = {"test-case": 0.5, "setup": 0.5}


def _words(text: str) -> set[str]:
    """Content words, cut to a 5-letter stem so cancel / cancels / cancelled / cancelling match."""
    return {w[:5] for w in WORD.findall(text.lower()) if w not in STOP and len(w) > 2}


class HybridRetriever:
    def __init__(self, docs: list[Document], vector: VectorStore, graph: GraphStore) -> None:
        self.docs = {d.id: d for d in docs if is_active(d)}
        self.vector = vector
        self.graph = graph

    def _vector_ranking(self, query: str, k: int, types: list[str] | None) -> tuple[list[str], dict[str, tuple[str, str]]]:
        hits = self.vector.query(query, k=k * 3, types=types)
        ranking: list[str] = []
        best_chunk: dict[str, tuple[str, str]] = {}
        for h in hits:
            if h.doc_id in self.docs and h.doc_id not in best_chunk:
                best_chunk[h.doc_id] = (h.section, h.text)
                ranking.append(h.doc_id)
        return ranking, best_chunk

    def _graph_ranking(self, query: str, vector_top: list[str], types: list[str] | None) -> list[str]:
        seeds: dict[str, tuple[float, int]] = {}
        for raw in ID.findall(query):
            if raw.upper() in self.docs:
                seeds[raw.upper()] = (1.0, 2)  # named explicitly: strongest, two hops
        q = _words(query)
        if q:
            for d in self.docs.values():
                overlap = len(q & _words(d.title)) / len(q)
                if overlap >= 0.25 and d.id not in seeds:
                    seeds[d.id] = (0.6 * overlap, 1)
        for rank, doc_id in enumerate(vector_top[:3]):
            seeds.setdefault(doc_id, (0.5 / (rank + 1), 1))

        scores: dict[str, float] = {}
        for seed, (strength, depth) in seeds.items():
            scores[seed] = max(scores.get(seed, 0.0), strength)
            for other, weight in self.graph.neighbors(seed, depth).items():
                if other in self.docs:
                    scores[other] = max(scores.get(other, 0.0), strength * weight)
        allowed = [d for d in scores if d in self.docs and (not types or self.docs[d].type in types)]
        return sorted(allowed, key=lambda d: -scores[d])

    def search(self, query: str, k: int = 6, scope: str | None = None, mode: Mode = "hybrid") -> list[Result]:
        types = SCOPES.get(scope or "", None)
        vector_rank, chunks = self._vector_ranking(query, k, types) if mode != "graph" else ([], {})
        if mode == "graph":
            vector_rank_for_seeds: list[str] = []
        else:
            vector_rank_for_seeds = vector_rank
        graph_rank = self._graph_ranking(query, vector_rank_for_seeds, types) if mode != "vector" else []

        # A document the query names by id is what was asked for: it counts as a third, top-ranked list.
        named = [i.upper() for i in ID.findall(query) if i.upper() in self.docs and (not types or self.docs[i.upper()].type in types)]

        fused: dict[str, float] = {}
        via: dict[str, list[str]] = {}
        wanted = {t for pattern, t in INTENT if pattern.search(query)}
        intent = [d for d in vector_rank if self.docs[d].type in wanted] if mode == "hybrid" else []

        for name, ranking in (
            ("vector", vector_rank),
            ("graph", graph_rank),
            ("id", named if mode == "hybrid" else []),
            ("intent", intent),
        ):
            for rank, doc_id in enumerate(ranking):
                fused[doc_id] = fused.get(doc_id, 0.0) + 1.0 / (RRF_K + rank + 1)
                via.setdefault(doc_id, []).append(name)

        for doc_id in fused:
            kind = self.docs[doc_id].type
            if kind in DERIVED_WEIGHT and kind not in wanted and not (types and kind in types):
                fused[doc_id] *= DERIVED_WEIGHT[kind]

        results: list[Result] = []
        for doc_id in sorted(fused, key=lambda d: -fused[d])[:k]:
            d = self.docs[doc_id]
            section, text = chunks.get(doc_id, ("", ""))
            if not text:
                text = f"{d.id} — {d.title}\n\n{d.body[:1200]}"
            related = sorted(n for n in self.graph.neighbors(doc_id, 1) if n in self.docs)[:12]
            results.append(Result(d.id, d.title, d.type, d.path, round(fused[doc_id], 5), via[doc_id], section, text, related))
        return results
