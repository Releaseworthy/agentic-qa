"""The `knowledge` MCP server: hybrid search over the vault, graph lookups, and write-back.

    uv run python -m rag.server            stdio (Claude Code, Agent SDK)
    uv run python -m rag.server --http     streamable HTTP on :8765/mcp — the shared endpoint
                                           other teams' AI tools connect to (see rag/Dockerfile)

Writes go through this server so the index stays in sync: a written document is
re-chunked into ChromaDB and the graph is rebuilt in the same call.
"""

from __future__ import annotations

import argparse
import os
import re
from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import Any

from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from rag.build import index_document, rebuild_graph
from rag.config import KNOWLEDGE_DIR, ROOT
from rag.graph import GraphStore, open_graph
from rag.hybrid import SCOPES, HybridRetriever, Mode
from rag.vault import Document, load_vault, parse
from rag.vector import VectorStore

INSTRUCTIONS = """Business knowledge of ShopLite: features (FEAT-*), business rules (BR-*), work-item
cards (CARD-*), defects (DEF-*), manual test cases (TC-*) and review learnings (LRN-*).
Search first (search_knowledge, pass a scope), then fetch whole documents by id (get_document).
Use related() to walk from a feature to its rules, code, endpoints, specs and defects.
Write only through upsert_document / add_learning."""

server = MCPServer("knowledge", instructions=INSTRUCTIONS)


class State:
    docs: list[Document]
    vector: VectorStore
    graph: GraphStore
    retriever: HybridRetriever

    def __init__(self) -> None:
        self.vector = VectorStore()
        self.reload()

    def reload(self) -> None:
        self.docs = load_vault()
        self.graph = open_graph()
        self.retriever = HybridRetriever(self.docs, self.vector, self.graph)


_state: State | None = None


def state() -> State:
    global _state
    if _state is None:
        _state = State()
    return _state


def _doc(doc_id: str) -> Document | None:
    key = doc_id.strip()
    for d in state().docs:
        if d.id == key.upper() or d.path == key or d.path.endswith("/" + key):
            return d
    return None


@server.tool()
def search_knowledge(query: str, scope: str | None = None, k: int = 6, mode: str = "hybrid") -> list[dict[str, Any]]:
    """Hybrid (vector + knowledge-graph) search of the vault.

    scope: wiki | rules | features | test-cases | learnings | defects | cards (omit for everything).
    mode: hybrid (default) | vector | graph. Returns the best chunk of each document,
    how it was found (`via`), and its graph neighbours (`related`).
    """
    if scope and scope not in SCOPES:
        raise ValueError(f"unknown scope {scope!r}; use one of {sorted(SCOPES)}")
    if mode not in ("hybrid", "vector", "graph"):
        raise ValueError("mode is hybrid, vector or graph")
    m: Mode = mode  # type: ignore[assignment]
    return [asdict(r) for r in state().retriever.search(query, k=max(1, min(k, 20)), scope=scope, mode=m)]


@server.tool()
def get_document(id_or_path: str) -> dict[str, Any]:
    """A whole document by id (`BR-SHIP-01`) or repo path (`knowledge/rules/BR-SHIP-01.md`)."""
    d = _doc(id_or_path)
    if not d:
        raise ValueError(f"no document {id_or_path!r}")
    return {"id": d.id, "type": d.type, "title": d.title, "path": d.path, "meta": d.meta, "body": d.body}


@server.tool()
def related(node_id: str, depth: int = 1) -> dict[str, Any]:
    """Graph neighbourhood of a document, code file, endpoint or spec: typed edges plus scored neighbours.

    `related("FEAT-CART")` lists its rules, code files, endpoints, specs that verify it, open defects…
    """
    g = state().graph
    node = g.node(node_id.upper()) or g.node(node_id)
    if not node:
        raise ValueError(f"no graph node {node_id!r}")
    edges = [asdict(e) for e in g.edges_of(node.id)]
    scored = sorted(g.neighbors(node.id, max(1, min(depth, 3))).items(), key=lambda kv: -kv[1])
    return {"node": asdict(node), "edges": edges, "neighbors": [{"id": i, "score": round(s, 3)} for i, s in scored[:40]]}


@server.tool()
def list_documents(type: str | None = None) -> list[dict[str, Any]]:
    """Every document (optionally one type: feature, rule, card, defect, test-case, learning) with key metadata."""
    out: list[dict[str, Any]] = []
    for d in state().docs:
        if type and d.type != type:
            continue
        keep = {k: d.meta[k] for k in ("criticality", "severity", "status", "feature", "priority") if k in d.meta}
        out.append({"id": d.id, "type": d.type, "title": d.title, "path": d.path, **keep})
    return out


def _write(path: Path, content: str) -> dict[str, Any]:
    resolved = path.resolve()
    if KNOWLEDGE_DIR.resolve() not in resolved.parents:
        raise ValueError("documents live under knowledge/")
    if resolved.suffix != ".md":
        raise ValueError("documents are .md files")
    doc = parse(resolved, content)
    if not doc.meta.get("id") or not doc.meta.get("type"):
        raise ValueError("frontmatter needs at least `id` and `type`")
    clash = _doc(doc.id)
    if clash and (ROOT / clash.path).resolve() != resolved:
        raise ValueError(f"id {doc.id} already belongs to {clash.path}")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(content if content.endswith("\n") else content + "\n", encoding="utf-8")
    s = state()
    chunks = index_document(doc, s.vector)
    rebuild_graph(load_vault())
    s.reload()
    unknown = [link for link in doc.links if not _doc(link)]
    return {"id": doc.id, "path": doc.path, "chunks": chunks, "index_ok": True, "warnings": [f"unknown link [[{u}]]" for u in unknown]}


@server.tool()
def upsert_document(path: str, content: str) -> dict[str, Any]:
    """Create or replace a vault document (full Markdown with frontmatter) and re-index it.

    path is repo-relative, e.g. `knowledge/test-cases/TC-CART-002-merge-lines.md`.
    """
    return _write(ROOT / path, content)


@server.tool()
def add_learning(title: str, lesson: str, applies_to: list[str] | None = None, source: str = "human review") -> dict[str, Any]:
    """Record a lesson from human review (PR comments, rejected tests) as `knowledge/learnings/LRN-<slug>.md`.

    An existing learning with the same title gets the lesson appended instead of a duplicate file.
    Keep `lesson` to durable, reusable guidance — not a log of what happened.
    """
    slug = re.sub(r"[^A-Z0-9]+", "-", title.upper()).strip("-")[:40]
    doc_id = f"LRN-{slug}"
    path = KNOWLEDGE_DIR / "learnings" / f"{doc_id}.md"
    existing = _doc(doc_id)
    if existing:
        text = (ROOT / existing.path).read_text(encoding="utf-8").rstrip()
        content = f"{text}\n\n## {date.today().isoformat()} ({source})\n\n{lesson.strip()}\n"
    else:
        applies = ", ".join(applies_to or [])
        content = (
            f"---\nid: {doc_id}\ntype: learning\ntitle: {title.strip()}\nsource: {source}\n"
            f"applies_to: [{applies}]\n---\n\n# {title.strip()}\n\n{lesson.strip()}\n"
        )
    return _write(path, content)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--http", action="store_true", help="serve streamable HTTP instead of stdio")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8765")))
    args = parser.parse_args()
    state()  # load the index before the first request
    if args.http:
        # Deployed behind a public host name: only those Host headers are served (DNS-rebinding protection).
        hosts = [h.strip() for h in os.environ.get("MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]
        security = (
            TransportSecuritySettings(
                enable_dns_rebinding_protection=True,
                allowed_hosts=hosts,
                allowed_origins=[f"https://{h}" for h in hosts],
            )
            if hosts
            else None
        )
        server.run("streamable-http", host=args.host, port=args.port, transport_security=security)
    else:
        server.run("stdio")


if __name__ == "__main__":
    main()
