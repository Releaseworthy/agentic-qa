"""Rebuilds the index: every vault chunk into ChromaDB, the graph into .rag/graph.json (and Neo4j when set).

    uv run python -m rag.build
"""

from __future__ import annotations

import time

from rag.config import GRAPH_FILE, NEO4J_URI
from rag.graph import LocalGraph, Neo4jGraph, build
from rag.vault import Document, chunk, is_active, load_vault
from rag.vector import VectorStore


def index_document(doc: Document, vector: VectorStore) -> int:
    if not is_active(doc):
        vector.delete_doc(doc.id)
        return 0
    chunks = chunk(doc)
    vector.upsert(doc, chunks)
    return len(chunks)


def rebuild_graph(docs: list[Document]) -> LocalGraph:
    nodes, edges = build(docs)
    graph = LocalGraph(nodes, edges)
    graph.save(GRAPH_FILE)
    if NEO4J_URI:
        neo = Neo4jGraph()
        try:
            neo.replace(nodes, edges)
        finally:
            neo.close()
    return graph


def main() -> None:
    started = time.perf_counter()
    docs = load_vault()
    vector = VectorStore()
    vector.reset()
    chunks = sum(index_document(d, vector) for d in docs)
    graph = rebuild_graph(docs)
    edges = sum(len(graph.edges_of(n.id)) for n in graph.nodes()) // 2
    print(
        f"Indexed {len(docs)} documents as {chunks} chunks; graph {len(graph.nodes())} nodes, {edges} edges"
        f"{' (also in Neo4j)' if NEO4J_URI else ''} — {time.perf_counter() - started:.1f}s"
    )


if __name__ == "__main__":
    main()
