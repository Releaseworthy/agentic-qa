"""Evaluates retrieval on rag/golden.yaml: vector-only vs graph-only vs hybrid.

    uv run python -m rag.eval                 retrieval metrics; fails below the thresholds
    uv run python -m rag.eval --answers       also answer quality: Claude answers from the
                                              retrieved context; key facts + an LLM judge
                                              (needs ANTHROPIC_API_KEY)

Metrics per mode: hit@1, hit@k (any expected doc in the top k), MRR. With
LANGSMITH_API_KEY set, the hybrid run is also logged to LangSmith as an
experiment over a `shoplite-knowledge` dataset, so runs can be compared over time.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from rag.config import ROOT
from rag.graph import open_graph
from rag.hybrid import HybridRetriever, Mode
from rag.vault import load_vault
from rag.vector import VectorStore

GOLDEN = Path(__file__).with_name("golden.yaml")
# Questions accepted knowledge changes answer (written by rag.curate): once learned, a document must stay findable.
LEARNED = Path(__file__).with_name("golden.learned.yaml")
OUT = ROOT / "out" / "rag-eval.json"
K = 5
# The gate: hybrid must find an answer for (almost) every question and beat vector-only on rank.
MIN_HYBRID_HIT_AT_K = 0.9
MIN_HYBRID_MRR = 0.8


@dataclass
class Case:
    q: str
    expected: list[str]
    facts: list[str]


def load_cases(learned: bool = True) -> list[Case]:
    raw: list[dict[str, Any]] = yaml.safe_load(GOLDEN.read_text(encoding="utf-8"))
    if learned and LEARNED.exists():
        raw += yaml.safe_load(LEARNED.read_text(encoding="utf-8")) or []
    return [Case(c["q"], c["expected"], c.get("facts", [])) for c in raw]


def score(ranked: list[str], expected: list[str]) -> tuple[float, float, float]:
    """hit@1, hit@K, reciprocal rank of the first expected document."""
    rr = next((1.0 / (i + 1) for i, d in enumerate(ranked) if d in expected), 0.0)
    return float(bool(ranked) and ranked[0] in expected), float(any(d in expected for d in ranked[:K])), rr


def run(retriever: HybridRetriever, cases: list[Case]) -> dict[str, Any]:
    report: dict[str, Any] = {"k": K, "cases": len(cases), "modes": {}, "misses": {}}
    for mode in ("vector", "graph", "hybrid"):
        m: Mode = mode  # type: ignore[assignment]
        totals = [0.0, 0.0, 0.0]
        misses: list[dict[str, Any]] = []
        for c in cases:
            ranked = [r.doc_id for r in retriever.search(c.q, k=K, mode=m)]
            s = score(ranked, c.expected)
            totals = [a + b for a, b in zip(totals, s)]
            if not s[1]:
                misses.append({"q": c.q, "expected": c.expected, "got": ranked})
        n = len(cases)
        report["modes"][mode] = {"hit@1": round(totals[0] / n, 3), f"hit@{K}": round(totals[1] / n, 3), "mrr": round(totals[2] / n, 3)}
        report["misses"][mode] = misses
    return report


def log_to_langsmith(retriever: HybridRetriever, cases: list[Case]) -> str | None:
    if not os.environ.get("LANGSMITH_API_KEY"):
        return None
    from langsmith import Client, evaluate

    client = Client()
    name = "shoplite-knowledge"
    if not client.has_dataset(dataset_name=name):
        ds = client.create_dataset(name, description="ShopLite vault retrieval golden set")
        client.create_examples(
            dataset_id=ds.id,
            inputs=[{"q": c.q} for c in cases],
            outputs=[{"expected": c.expected, "facts": c.facts} for c in cases],
        )

    def target(inputs: dict[str, Any]) -> dict[str, Any]:
        return {"ranked": [r.doc_id for r in retriever.search(inputs["q"], k=K)]}

    def hit_at_k(outputs: dict[str, Any], reference_outputs: dict[str, Any]) -> dict[str, Any]:
        return {"key": f"hit@{K}", "score": score(outputs["ranked"], reference_outputs["expected"])[1]}

    def mrr(outputs: dict[str, Any], reference_outputs: dict[str, Any]) -> dict[str, Any]:
        return {"key": "mrr", "score": score(outputs["ranked"], reference_outputs["expected"])[2]}

    results = evaluate(target, data=name, evaluators=[hit_at_k, mrr], experiment_prefix="hybrid-retrieval")
    return str(getattr(results, "experiment_name", "logged"))


JUDGE_SCHEMA = {
    "type": "object",
    "properties": {"faithful": {"type": "boolean"}, "answers_question": {"type": "boolean"}, "reason": {"type": "string"}},
    "required": ["faithful", "answers_question", "reason"],
    "additionalProperties": False,
}


def answer_quality(retriever: HybridRetriever, cases: list[Case]) -> dict[str, Any]:
    """Claude answers each question from the hybrid context only; a second call judges the answer."""
    import anthropic

    client = anthropic.Anthropic()
    model = os.environ.get("RAG_EVAL_MODEL", "claude-opus-5-5")
    rows: list[dict[str, Any]] = []
    for c in cases:
        context = "\n\n---\n\n".join(r.text for r in retriever.search(c.q, k=K))
        reply = client.messages.create(
            model=model,
            max_tokens=2000,
            output_config={"effort": "low"},
            system="Answer from the context only, in at most three sentences. If the context does not say, answer 'not documented'.",
            messages=[{"role": "user", "content": f"<context>\n{context}\n</context>\n\nQuestion: {c.q}"}],
        )
        if reply.stop_reason == "refusal":
            rows.append({"q": c.q, "error": "refusal"})
            continue
        answer = "".join(b.text for b in reply.content if b.type == "text")
        verdict = client.messages.create(
            model=model,
            max_tokens=2000,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": JUDGE_SCHEMA}},
            messages=[
                {
                    "role": "user",
                    "content": f"<context>\n{context}\n</context>\n<question>{c.q}</question>\n<answer>{answer}</answer>\n\n"
                    "Is every claim in the answer supported by the context (faithful)? Does it answer the question?",
                }
            ],
        )
        judged = json.loads(next(b.text for b in verdict.content if b.type == "text"))
        facts = sum(1 for f in c.facts if f.lower() in answer.lower()) / max(1, len(c.facts))
        rows.append({"q": c.q, "answer": answer, "facts": round(facts, 2), **judged})
    ok = [r for r in rows if "error" not in r]
    return {
        "model": model,
        "faithfulness": round(sum(r["faithful"] for r in ok) / max(1, len(ok)), 3),
        "answered": round(sum(r["answers_question"] for r in ok) / max(1, len(ok)), 3),
        "fact_coverage": round(sum(r["facts"] for r in ok) / max(1, len(ok)), 3),
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--answers", action="store_true", help="also evaluate answer quality with Claude")
    args = parser.parse_args()

    cases = load_cases()
    retriever = HybridRetriever(load_vault(), VectorStore(), open_graph())
    report = run(retriever, cases)
    experiment = log_to_langsmith(retriever, cases)
    if experiment:
        report["langsmith_experiment"] = experiment
    if args.answers:
        report["answers"] = answer_quality(retriever, cases)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    lines = [f"| mode | hit@1 | hit@{K} | MRR |", "| --- | --- | --- | --- |"]
    for mode, m in report["modes"].items():
        lines.append(f"| {mode} | {m['hit@1']} | {m[f'hit@{K}']} | {m['mrr']} |")
    table = "\n".join(lines)
    print(f"Retrieval on {len(cases)} questions (k={K}):\n\n{table}\n")
    for q in report["misses"]["hybrid"]:
        print(f"  hybrid miss: {q['q']} expected {q['expected']} got {q['got']}")
    if "answers" in report:
        a = report["answers"]
        print(f"Answers ({a['model']}): faithful {a['faithfulness']} · answered {a['answered']} · facts {a['fact_coverage']}")
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### RAG retrieval eval\n\n{table}\n")

    hybrid = report["modes"]["hybrid"]
    failures = []
    if hybrid[f"hit@{K}"] < MIN_HYBRID_HIT_AT_K:
        failures.append(f"hybrid hit@{K} {hybrid[f'hit@{K}']} < {MIN_HYBRID_HIT_AT_K}")
    if hybrid["mrr"] < MIN_HYBRID_MRR:
        failures.append(f"hybrid MRR {hybrid['mrr']} < {MIN_HYBRID_MRR}")
    if hybrid["mrr"] < report["modes"]["vector"]["mrr"]:
        failures.append("hybrid ranks worse than vector-only")
    if failures:
        print("FAILED: " + "; ".join(failures))
        sys.exit(1)


if __name__ == "__main__":
    main()
