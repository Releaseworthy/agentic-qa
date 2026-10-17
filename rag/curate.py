"""Knowledge curation: every change an agent wants to make to the vault is a proposal that is evaluated first.

    propose ──▶ gate (this module, deterministic) ──▶ judge (knowledge-curator subagent, rubric) ──▶ commit
                 shape · evidence · links · scope        grounded · reusable · actionable ·          accepted → vault
                 ownership · novelty · retrieval          scoped · consistent (1-5 each)              human-owned → _curation/proposals
                                                                                                       anything else → rejected
Every decision is appended to knowledge/_curation/ledger.jsonl.

    uv run python -m rag.curate evaluate <proposal.json>   the gate alone (dry run, nothing stored)
    uv run python -m rag.curate audit                      stale, duplicate and unconfirmed learnings

Ownership: learnings belong to the agents (auto-commit after gate + judge). Feature cards' technical map
(`code`, `endpoints`, `pages`) too; their behaviour, rules, cards and the overview belong to Product and
always go to a human. Test cases and defects are QA artifacts, written with `upsert_document` and reviewed
by `test-reviewer`, not curated here.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import sys
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Literal

import yaml

from rag.config import KNOWLEDGE_DIR, RAG_DIR, ROOT
from rag.eval import K, LEARNED, Case, load_cases, score
from rag.graph import LocalGraph, build
from rag.hybrid import HybridRetriever
from rag.vault import FRONTMATTER, Document, chunk, is_active, load_vault, parse
from rag.vector import VectorStore

CURATION_DIR = KNOWLEDGE_DIR / "_curation"
LEDGER = CURATION_DIR / "ledger.jsonl"
PROPOSALS_DIR = CURATION_DIR / "proposals"
PENDING_DIR = RAG_DIR / "pending"

Kind = Literal["add", "update", "deprecate"]
Verdict = Literal["accept", "reject", "needs_human"]

CRITERIA = ("grounded", "reusable", "actionable", "scoped", "consistent")
MIN_SCORE = 3  # every criterion
MIN_MEAN = 4.0
# Cosine; an `add` this close to an existing document must be an `update` of it. Calibrated on MiniLM:
# a paraphrase of LRN-UI-WAITS scores 0.72, an unrelated lesson 0.33.
DUPLICATE_SIMILARITY = 0.65
MAX_MRR_DROP = 0.02
MAX_LESSON_CHARS = 1500
UNCONFIRMED_DAYS = 60

EVIDENCE_KINDS = {"test-run", "api-response", "screenshot", "review", "pr-comment", "human", "code", "transcript"}
HUMAN_EVIDENCE = {"review", "pr-comment", "human"}
QA_ARTIFACTS = {"test-case", "defect"}
# Generated from code: the setup catalog is rendered from framework/setup/recipes.ts (bun run qa:arrange --catalog).
GENERATED = {"setup"}
PRODUCT_OWNED = {"rule", "card", "overview"}
FEATURE_MAP_KEYS = {"code", "endpoints", "pages"}
FOLDERS = {"learning": "learnings", "feature": "features", "rule": "rules", "card": "cards", "overview": "product"}
# Guidance, not a diary: a lesson that narrates a run is not reusable.
LOG_PHRASES = re.compile(r"\b(this run|this session|today|yesterday|I (ran|tried|found|fixed)|we (ran|tried|found))\b", re.I)


@dataclass
class Evidence:
    kind: str
    ref: str
    quote: str = ""


@dataclass
class Proposal:
    kind: Kind
    type: str
    title: str
    body: str
    """Learning: the lesson (Markdown). Other types: the whole document, frontmatter included. Deprecate: the reason."""
    evidence: list[Evidence]
    source: str
    probe: str
    """A question this knowledge answers; after the change, retrieval must return the document for it."""
    target: str | None = None
    applies_to: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Proposal":
        kind = raw.get("kind")
        if kind not in ("add", "update", "deprecate"):
            raise ValueError("kind is add, update or deprecate")
        evidence = [
            Evidence(str(e.get("kind", "")), str(e.get("ref", "")), str(e.get("quote", "")))
            for e in raw.get("evidence") or []
            if isinstance(e, dict)
        ]
        return cls(
            kind=kind,
            type=str(raw.get("type", "learning")),
            title=str(raw.get("title", "")).strip(),
            body=str(raw.get("body", "")).strip(),
            evidence=evidence,
            source=str(raw.get("source", "")).strip(),
            probe=str(raw.get("probe", "")).strip(),
            target=str(raw["target"]).strip().upper() if raw.get("target") else None,
            applies_to=[str(a) for a in raw.get("applies_to") or []],
        )


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


@dataclass
class Evaluation:
    proposal_id: str
    doc_id: str
    path: str
    decision: Literal["judge", "needs_human", "reject"]
    """judge: the gate passed, an independent judge decides. needs_human: passed, but Product owns it. reject: failed."""
    checks: list[Check]
    neighbours: list[dict[str, Any]]
    retrieval: dict[str, Any]
    preview: str

    @property
    def failed(self) -> list[Check]:
        return [c for c in self.checks if not c.ok]


# ---- documents --------------------------------------------------------------------------------------------


def learning_id(title: str) -> str:
    """LRN- plus the title's words, cut at a word boundary (at most 40 characters after the prefix)."""
    words = re.sub(r"[^A-Z0-9]+", "-", title.upper()).strip("-").split("-")
    out = ""
    for w in words:
        if out and len(out) + 1 + len(w) > 40:
            break
        out = f"{out}-{w}" if out else w[:40]
    return "LRN-" + out


def written(content: str) -> str:
    """The file a write leaves: LF line endings and one trailing newline. The ledger's `sha` covers exactly this, so
    qa/knowledge-guard.ts can prove a vault file in a patch is the one the gate and the judge accepted."""
    text = content.replace("\r\n", "\n")
    return text if text.endswith("\n") else text + "\n"


def content_sha(content: str) -> str:
    return hashlib.sha256(written(content).encode("utf-8")).hexdigest()[:12]


def _dump(meta: dict[str, Any]) -> str:
    return yaml.safe_dump(meta, sort_keys=False, default_flow_style=None, allow_unicode=True, width=1000).strip()


def _merged(old: list[str], new: list[str], keep: int = 10) -> list[str]:
    out = [x for x in old if x not in new] + new
    return out[-keep:]


def render_learning(doc_id: str, p: Proposal, prior: Document | None, today: date) -> str:
    """A learning with its provenance: support counts independent sources; human evidence makes it established."""
    prior_sources = [str(s) for s in (prior.meta.get("sources") or [prior.meta.get("source")] if prior else []) if s]
    support = 1 if prior is None else int(prior.meta.get("support", 1)) + (0 if p.source in prior_sources else 1)
    human = any(e.kind in HUMAN_EVIDENCE for e in p.evidence)
    established = human or support >= 2 or bool(prior and prior.meta.get("confidence") == "established")
    meta = {
        "id": doc_id,
        "type": "learning",
        "title": p.title,
        "status": "active",
        "confidence": "established" if established else "provisional",
        "support": support,
        "applies_to": p.applies_to or (list(prior.meta.get("applies_to") or []) if prior else []),
        "sources": _merged(prior_sources, [p.source]),
        "evidence": _merged([str(e) for e in (prior.meta.get("evidence") or [])] if prior else [], [f"{e.kind}: {e.ref}" for e in p.evidence]),
        "created": str(prior.meta.get("created", today.isoformat())) if prior else today.isoformat(),
        "updated": today.isoformat(),
    }
    # The title is the H1; a lesson that opens with its own heading would show it twice.
    body = re.sub(r"\A#\s[^\n]*\n+", "", p.body)
    return f"---\n{_dump(meta)}\n---\n\n# {p.title}\n\n{body}\n"


def render_deprecated(target: Document, reason: str, today: date) -> str:
    text = (ROOT / target.path).read_text(encoding="utf-8")
    m = FRONTMATTER.match(text)
    body = text[m.end() :] if m else text
    meta = {**target.meta, "status": "deprecated", "deprecated_on": today.isoformat(), "deprecated_reason": reason}
    return f"---\n{_dump(meta)}\n---\n{body if body.startswith(chr(10)) else chr(10) + body}"


def _resolve(p: Proposal, by_id: dict[str, Document], today: date) -> tuple[str, str, str]:
    """(doc id, repo-relative path, full content) the proposal would write."""
    target = by_id.get(p.target or "")
    if p.kind == "deprecate":
        if not target:
            raise ValueError(f"deprecate needs an existing target, got {p.target!r}")
        return target.id, target.path, render_deprecated(target, p.body, today)
    if p.type == "learning":
        doc_id = target.id if (p.kind == "update" and target) else learning_id(p.title)
        path = target.path if (p.kind == "update" and target) else f"knowledge/learnings/{doc_id}.md"
        return doc_id, path, render_learning(doc_id, p, target if p.kind == "update" else None, today)
    doc = parse(Path(f"{p.type}.md"), p.body)
    if not doc.meta.get("id"):
        raise ValueError("the document needs frontmatter with an `id`")
    folder = FOLDERS.get(p.type)
    if p.kind == "update" and target:
        return doc.id, target.path, p.body if p.body.endswith("\n") else p.body + "\n"
    if not folder:
        raise ValueError(f"no vault folder for type {p.type!r}")
    return doc.id, f"knowledge/{folder}/{doc.id}.md", p.body if p.body.endswith("\n") else p.body + "\n"


# ---- the gate ---------------------------------------------------------------------------------------------


def _looks_like_path(ref: str) -> bool:
    return bool(re.fullmatch(r"[\w.\-/\\]+(:\d+)?", ref)) and ("/" in ref or "\\" in ref) and not ref.startswith("http")


def check_shape(p: Proposal, new_doc: Document, by_id: dict[str, Document]) -> Check:
    problems: list[str] = []
    if not p.title or len(p.title) > 90:
        problems.append("title is 1-90 characters")
    if not p.body:
        problems.append("body is empty")
    if p.kind != "deprecate" and (not p.probe.endswith("?") or len(p.probe) < 12):
        problems.append("probe is a question (ends with '?') this knowledge answers")
    if p.kind == "add" and new_doc.id in by_id:
        problems.append(f"{new_doc.id} exists, so propose an update of it instead")
    if p.kind in ("update", "deprecate"):
        target = by_id.get(p.target or "")
        if not target:
            problems.append(f"target {p.target!r} does not exist")
        elif target.type != p.type:
            problems.append(f"target {target.id} is a {target.type}, not a {p.type}")
        elif p.kind == "update" and new_doc.id != target.id:
            problems.append(f"an update keeps the id {target.id}")
    if p.type == "learning" and p.kind != "deprecate":
        if len(p.body) > MAX_LESSON_CHARS:
            problems.append(f"lesson is over {MAX_LESSON_CHARS} characters; split it or cut it")
        if m := LOG_PHRASES.search(p.body):
            problems.append(f"reads as a run log ({m.group(0)!r}); state the rule, why, and where it applies")
    return Check("shape", not problems, "; ".join(problems) or "ok")


def check_evidence(p: Proposal) -> Check:
    if not p.evidence:
        return Check("evidence", False, "no evidence: every change has to cite what proves it")
    problems = [f"unknown evidence kind {e.kind!r}" for e in p.evidence if e.kind not in EVIDENCE_KINDS]
    for e in p.evidence:
        if not e.ref:
            problems.append(f"{e.kind} evidence without a ref")
        elif _looks_like_path(e.ref) and not (ROOT / re.sub(r":\d+$", "", e.ref)).exists():
            problems.append(f"evidence file {e.ref} does not exist")
    if not p.source:
        problems.append("source is empty (which run or review this comes from)")
    return Check("evidence", not problems, "; ".join(problems) or f"{len(p.evidence)} item(s)")


def check_links(new_doc: Document, by_id: dict[str, Document]) -> Check:
    unknown = [link for link in new_doc.links if link not in by_id and link != new_doc.id]
    return Check("links", not unknown, f"unknown [[{', '.join(unknown)}]]" if unknown else "ok")


def check_scope(p: Proposal, new_doc: Document) -> Check:
    if p.type != "learning" or p.kind == "deprecate":
        return Check("scope", True, "n/a")
    globs = [str(g) for g in new_doc.meta.get("applies_to") or []]
    if not globs:
        return Check("scope", False, "applies_to is empty: name the paths the lesson governs")
    dead = [g for g in globs if next(iter(ROOT.glob(g.rstrip("/"))), None) is None]
    return Check("scope", not dead, f"applies_to matches no file: {', '.join(dead)}" if dead else ", ".join(globs))


def check_ownership(p: Proposal, new_doc: Document, by_id: dict[str, Document]) -> tuple[Check, bool]:
    """(check, needs a human). QA artifacts are refused here; Product-owned knowledge goes to a human."""
    if p.type in QA_ARTIFACTS:
        return Check("ownership", False, f"{p.type}s are written with upsert_document and reviewed by test-reviewer"), False
    if p.type in GENERATED or (p.target or "").startswith("SETUP-"):
        return Check("ownership", False, "generated from framework/setup/recipes.ts: add or change a recipe (RECIPE_MISSING), then bun run qa:arrange --catalog"), False
    if p.type == "learning":
        return Check("ownership", True, "agent-owned"), False
    if p.type == "feature" and p.kind == "update" and (target := by_id.get(p.target or "")):
        changed = {k for k in set(target.meta) | set(new_doc.meta) if target.meta.get(k) != new_doc.meta.get(k)}
        if new_doc.body.strip() == target.body.strip() and changed <= FEATURE_MAP_KEYS:
            return Check("ownership", True, f"technical map only ({', '.join(sorted(changed)) or 'no change'})"), False
        return Check("ownership", True, f"changes Product-owned behaviour ({', '.join(sorted(changed - FEATURE_MAP_KEYS)) or 'body'})"), True
    if p.type in PRODUCT_OWNED or p.type == "feature":
        return Check("ownership", True, f"{p.type}s are owned by Product"), True
    return Check("ownership", False, f"type {p.type!r} is not curated"), False


def _score_all(retriever: HybridRetriever, cases: list[Case]) -> dict[str, Any]:
    per: dict[str, tuple[float, float]] = {}
    for c in cases:
        ranked = [r.doc_id for r in retriever.search(c.q, k=K)]
        _, hit, rr = score(ranked, c.expected)
        per[c.q] = (hit, rr)
    n = max(1, len(per))
    return {"hit": round(sum(h for h, _ in per.values()) / n, 3), "mrr": round(sum(r for _, r in per.values()) / n, 3), "per": per}


def retrieval_and_novelty(
    p: Proposal, before: list[Document], after: list[Document], new_doc: Document, cases: list[Case]
) -> tuple[Check, Check, list[dict[str, Any]], dict[str, Any]]:
    """Builds a throwaway index of the vault, scores the golden set before and after the change, and measures
    how close the new document is to existing ones. The live index is never touched."""
    active_before = [d for d in before if is_active(d)]
    active_after = [d for d in after if is_active(d)]
    store = VectorStore.shadow()
    try:
        for d in active_before:
            store.upsert(d, chunk(d))

        neighbours: list[dict[str, Any]] = []
        if p.kind != "deprecate":
            text = f"{new_doc.title}\n\n{new_doc.body[:1200]}"
            seen: set[str] = set()
            for h in store.query(text, k=8, types=[new_doc.type]):
                if h.doc_id in seen or h.doc_id == p.target:
                    continue
                seen.add(h.doc_id)
                neighbours.append({"id": h.doc_id, "similarity": round(1 - h.distance, 3), "section": h.section})
            neighbours = neighbours[:3]
        top = neighbours[0] if neighbours else None
        if p.kind == "add" and top and top["similarity"] >= DUPLICATE_SIMILARITY:
            novelty = Check("novelty", False, f"near-duplicate of {top['id']} ({top['similarity']}); propose an update of it instead")
        else:
            novelty = Check("novelty", True, f"closest {top['id']} ({top['similarity']})" if top else "nothing similar")

        base = _score_all(HybridRetriever(active_before, store, LocalGraph(*build(active_before))), cases)
        if is_active(new_doc):
            store.upsert(new_doc, chunk(new_doc))
        else:
            store.delete_doc(new_doc.id)
        after_retriever = HybridRetriever(active_after, store, LocalGraph(*build(active_after)))
        now = _score_all(after_retriever, cases)

        lost = [q for q, (hit, _) in base["per"].items() if hit and not now["per"][q][0]]
        drop = round(base["mrr"] - now["mrr"], 3)
        problems = [f"golden question no longer answered: {q!r}" for q in lost]
        if drop > MAX_MRR_DROP:
            problems.append(f"MRR drops {drop} (> {MAX_MRR_DROP})")
        probe_rank: int | None = None
        if is_active(new_doc):
            ranked = [r.doc_id for r in after_retriever.search(p.probe, k=K)]
            probe_rank = ranked.index(new_doc.id) + 1 if new_doc.id in ranked else None
            if probe_rank is None:
                problems.append(f"the probe question does not retrieve {new_doc.id} in the top {K}")
        report = {
            "cases": len(cases),
            "before": {"hit": base["hit"], "mrr": base["mrr"]},
            "after": {"hit": now["hit"], "mrr": now["mrr"]},
            "lost": lost,
            "probe_rank": probe_rank,
        }
        detail = "; ".join(problems) or f"MRR {base['mrr']} → {now['mrr']}, probe rank {probe_rank}"
        return Check("retrieval", not problems, detail), novelty, neighbours, report
    finally:
        store.drop()


def evaluate(raw: dict[str, Any], docs: list[Document] | None = None, today: date | None = None) -> tuple[Evaluation, Proposal, str]:
    """Runs the gate. Returns the evaluation, the parsed proposal and the content it would write."""
    today = today or date.today()
    docs = docs if docs is not None else load_vault()
    by_id = {d.id: d for d in docs}
    p = Proposal.from_dict(raw)
    doc_id, path, content = _resolve(p, by_id, today)
    new_doc = parse(ROOT / path, content)

    checks = [check_shape(p, new_doc, by_id), check_evidence(p), check_links(new_doc, by_id), check_scope(p, new_doc)]
    owner, human = check_ownership(p, new_doc, by_id)
    checks.append(owner)
    neighbours: list[dict[str, Any]] = []
    retrieval: dict[str, Any] = {}
    if all(c.ok for c in checks):
        after = [d for d in docs if d.id != new_doc.id] + [new_doc]
        retrieval_check, novelty, neighbours, retrieval = retrieval_and_novelty(p, docs, after, new_doc, load_cases())
        checks += [novelty, retrieval_check]
    else:
        checks.append(Check("retrieval", True, "skipped until the failed checks are fixed"))

    decision: Literal["judge", "needs_human", "reject"] = (
        "reject" if any(not c.ok for c in checks) else "needs_human" if human else "judge"
    )
    pid = f"PROP-{today.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}"
    return Evaluation(pid, doc_id, path, decision, checks, neighbours, retrieval, content), p, content


# ---- pending proposals, commit, ledger ----------------------------------------------------------------------


def save_pending(ev: Evaluation, raw: dict[str, Any]) -> None:
    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    (PENDING_DIR / f"{ev.proposal_id}.json").write_text(
        json.dumps({"proposal": raw, "evaluation": asdict(ev)}, indent=1, ensure_ascii=False), encoding="utf-8"
    )


PROPOSAL_ID = re.compile(r"^PROP-\d{8}-[0-9a-f]{6}$")


def load_pending(proposal_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    # The id becomes a file name (read here, deleted after the decision): only ids evaluate() hands out.
    if not PROPOSAL_ID.match(proposal_id):
        raise ValueError(f"not a proposal id: {proposal_id!r} (PROP-YYYYMMDD-xxxxxx)")
    path = PENDING_DIR / f"{proposal_id}.json"
    if not path.exists():
        raise ValueError(f"no pending proposal {proposal_id}; evaluate it with propose_knowledge first")
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["proposal"], data["evaluation"]


@dataclass
class Outcome:
    decision: Literal["accepted", "rejected", "needs-human"]
    doc_id: str
    reason: str
    write: tuple[str, str] | None = None
    """(repo-relative path, content) for the caller to write and re-index."""
    proposal_file: str | None = None
    ledger: dict[str, Any] = field(default_factory=dict)


def judge_bar(scores: dict[str, int]) -> str | None:
    """None when the scores clear the bar, else why not."""
    missing = [c for c in CRITERIA if c not in scores]
    if missing:
        return f"scores missing: {', '.join(missing)}"
    values = [int(scores[c]) for c in CRITERIA]
    if any(v < 1 or v > 5 for v in values):
        return "scores are 1-5"
    if min(values) < MIN_SCORE:
        low = [c for c in CRITERIA if int(scores[c]) < MIN_SCORE]
        return f"{', '.join(low)} below {MIN_SCORE}"
    if sum(values) / len(values) < MIN_MEAN:
        return f"mean {sum(values) / len(values):.1f} below {MIN_MEAN}"
    return None


def decide(proposal_id: str, verdict: Verdict, scores: dict[str, int], rationale: str, judge: str) -> Outcome:
    """Combines the gate's result with the judge's verdict. The gate can't be overruled: a failed gate is a
    rejection whatever the judge says, and an accept below the score bar is recorded as a rejection."""
    raw, ev = load_pending(proposal_id)
    doc_id, gate = ev["doc_id"], ev["decision"]
    bar = judge_bar(scores)
    if gate == "reject":
        decision, reason = "rejected", "gate failed: " + "; ".join(c["detail"] for c in ev["checks"] if not c["ok"])
    elif verdict == "reject":
        decision, reason = "rejected", f"judge rejected: {rationale}"
    elif verdict == "accept" and bar:
        decision, reason = "rejected", f"judge scores do not clear the bar ({bar})"
    elif gate == "needs_human" or verdict == "needs_human":
        decision, reason = "needs-human", next((c["detail"] for c in ev["checks"] if c["name"] == "ownership"), rationale)
    else:
        decision, reason = "accepted", rationale

    entry = {
        "id": proposal_id,
        "at": date.today().isoformat(),
        "decision": decision,
        "reason": reason,
        "kind": raw.get("kind"),
        "type": raw.get("type", "learning"),
        "doc": doc_id,
        "title": raw.get("title"),
        "source": raw.get("source"),
        "evidence": [f"{e.get('kind')}: {e.get('ref')}" for e in raw.get("evidence") or []],
        "gate": {c["name"]: c["ok"] for c in ev["checks"]},
        "retrieval": {k: v for k, v in (ev.get("retrieval") or {}).items() if k != "per"},
        "judge": {"by": judge, "verdict": verdict, "scores": scores, "rationale": rationale},
        "sha": content_sha(ev["preview"]),
    }
    out = Outcome(decision, doc_id, reason, ledger=entry)
    if decision == "accepted":
        out.write = (ev["path"], written(ev["preview"]))
        if raw.get("kind") == "deprecate":
            remove_probes(doc_id)
        else:
            add_probe(str(raw.get("probe")), doc_id, proposal_id)
    elif decision == "needs-human":
        out.proposal_file = write_human_proposal(proposal_id, raw, ev, entry)
    append_ledger(entry)
    (PENDING_DIR / f"{proposal_id}.json").unlink(missing_ok=True)
    return out


def append_ledger(entry: dict[str, Any]) -> None:
    CURATION_DIR.mkdir(parents=True, exist_ok=True)
    with LEDGER.open("a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _learned() -> list[dict[str, Any]]:
    return (yaml.safe_load(LEARNED.read_text(encoding="utf-8")) or []) if LEARNED.exists() else []


class _PrettierYaml(yaml.SafeDumper):
    """Indents a list under its key (`expected:\\n    - X`), as Prettier formats YAML, because an agent's pull request has
    to pass `format:check` like anyone else's."""

    def increase_indent(self, flow: bool = False, indentless: bool = False) -> None:
        super().increase_indent(flow, False)


def _write_learned(rows: list[dict[str, Any]]) -> None:
    header = (
        "# Probe questions of accepted knowledge changes, appended by rag.curate. Each one must keep\n"
        "# retrieving its document, so a later change cannot make learned knowledge unfindable.\n"
    )
    body = yaml.dump(rows, Dumper=_PrettierYaml, sort_keys=False, allow_unicode=True, width=1000) if rows else "[]\n"
    LEARNED.write_text(header + body, encoding="utf-8", newline="\n")


def add_probe(question: str, doc_id: str, proposal_id: str) -> None:
    rows = [r for r in _learned() if r.get("q") != question]
    rows.append({"q": question, "expected": [doc_id], "from": proposal_id})
    _write_learned(rows)


def remove_probes(doc_id: str) -> None:
    _write_learned([r for r in _learned() if r.get("expected") != [doc_id]])


def write_human_proposal(proposal_id: str, raw: dict[str, Any], ev: dict[str, Any], entry: dict[str, Any]) -> str:
    """A Markdown proposal a human reviews in the PR: evidence, gate, judge, and the diff to apply by hand."""
    PROPOSALS_DIR.mkdir(parents=True, exist_ok=True)
    current = ROOT / ev["path"]
    old = current.read_text(encoding="utf-8").splitlines(keepends=True) if current.exists() else []
    diff = "".join(difflib.unified_diff(old, ev["preview"].splitlines(keepends=True), ev["path"], ev["path"] + " (proposed)"))
    gate = "\n".join(f"| {c['name']} | {'✅' if c['ok'] else '❌'} | {c['detail']} |" for c in ev["checks"])
    evidence = "\n".join(f"- **{e.get('kind')}** `{e.get('ref')}`{': ' + e.get('quote', '') if e.get('quote') else ''}" for e in raw.get("evidence") or [])
    j = entry["judge"]
    text = (
        f"---\nproposal: {proposal_id}\ndoc: {ev['doc_id']}\nkind: {raw.get('kind')}\nsource: {json.dumps(raw.get('source'))}\nstatus: needs-human\n---\n\n"
        f"# {proposal_id}: {raw.get('title')}\n\n"
        f"**Needs a human because:** {entry['reason']}. Apply the diff by hand (then `bun run rag:build`) or delete this file to decline.\n\n"
        f"## Evidence\n\n{evidence}\n\n## Gate\n\n| Check | | Detail |\n| --- | --- | --- |\n{gate}\n\n"
        f"## Judge ({j['by']})\n\n{', '.join(f'{k} {v}' for k, v in j['scores'].items())}. {j['rationale']}\n\n"
        f"## Proposed change\n\n~~~~diff\n{diff}~~~~\n"
    )
    path = PROPOSALS_DIR / f"{proposal_id}.md"
    path.write_text(text, encoding="utf-8", newline="\n")
    return path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path.as_posix()


# ---- audit ---------------------------------------------------------------------------------------------------


def audit(docs: list[Document] | None = None, today: date | None = None) -> dict[str, Any]:
    """What a periodic `learn --audit` turns into proposals: learnings that point at nothing, that no second
    source ever confirmed, or that say the same thing twice; broken links; proposals waiting for a human."""
    today = today or date.today()
    docs = docs if docs is not None else load_vault()
    by_id = {d.id: d for d in docs}
    learnings = [d for d in docs if d.type == "learning" and is_active(d)]
    stale = [
        {"id": d.id, "dead": dead}
        for d in learnings
        if (dead := [g for g in (d.meta.get("applies_to") or []) if next(iter(ROOT.glob(str(g).rstrip("/"))), None) is None])
    ]
    cutoff = today - timedelta(days=UNCONFIRMED_DAYS)
    unconfirmed = [
        {"id": d.id, "updated": str(d.meta.get("updated"))}
        for d in learnings
        if d.meta.get("confidence") == "provisional" and str(d.meta.get("updated", today.isoformat())) <= cutoff.isoformat()
    ]
    broken = [{"id": d.id, "links": u} for d in docs if (u := [link for link in d.links if link not in by_id])]
    duplicates: list[dict[str, Any]] = []
    if len(learnings) > 1:
        store = VectorStore.shadow()
        try:
            for d in learnings:
                store.upsert(d, chunk(d))
            pairs: set[tuple[str, str]] = set()
            for d in learnings:
                for h in store.query(f"{d.title}\n\n{d.body[:1200]}", k=4, types=["learning"]):
                    pair = (min(d.id, h.doc_id), max(d.id, h.doc_id))
                    if h.doc_id != d.id and pair not in pairs and 1 - h.distance >= DUPLICATE_SIMILARITY:
                        pairs.add(pair)
                        duplicates.append({"ids": list(pair), "similarity": round(1 - h.distance, 3)})
        finally:
            store.drop()
    pending = sorted(p.relative_to(ROOT).as_posix() for p in PROPOSALS_DIR.glob("*.md")) if PROPOSALS_DIR.exists() else []
    return {"stale_scope": stale, "unconfirmed": unconfirmed, "duplicates": duplicates, "broken_links": broken, "awaiting_human": pending}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    ev = sub.add_parser("evaluate", help="run the gate on a proposal JSON file (dry run)")
    ev.add_argument("file")
    sub.add_parser("audit", help="stale, unconfirmed and duplicate learnings")
    args = parser.parse_args()
    if args.cmd == "evaluate":
        evaluation, _, _ = evaluate(json.loads(Path(args.file).read_text(encoding="utf-8")))
        print(json.dumps({k: v for k, v in asdict(evaluation).items() if k != "preview"}, indent=2, ensure_ascii=False))
        sys.exit(0 if evaluation.decision != "reject" else 1)
    report = audit()
    out = ROOT / "out" / "knowledge-audit.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
