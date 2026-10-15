"""The knowledge graph: documents, code files, endpoints and spec files, linked by typed edges.

Built from frontmatter fields and [[links]]. Two interchangeable stores:
`LocalGraph` (in memory, persisted as JSON) and `Neo4jGraph` (when NEO4J_URI is set).
Traversal ignores edge direction; each edge type carries a weight used when ranking.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Protocol

from rag.config import GRAPH_FILE, NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER, ROOT, TESTS_DIR
from rag.vault import Document

TAG = re.compile(r"@((?:FEAT|BR|DEF)-[A-Z0-9-]+)")

# (frontmatter field, edge type, weight)
FIELD_EDGES: list[tuple[str, str, float]] = [
    ("rules", "GOVERNED_BY", 1.0),
    ("feature", "PART_OF", 1.0),
    ("covers", "COVERS", 0.9),
    ("related", "RELATES_TO", 0.8),
    ("depends_on", "DEPENDS_ON", 0.6),
    ("code", "IMPLEMENTED_IN", 0.5),
    ("endpoints", "EXPOSES", 0.5),
    ("applies_to", "APPLIES_TO", 0.3),
]
LINK_WEIGHT = 0.7
VERIFIES_WEIGHT = 0.6


@dataclass(frozen=True)
class Node:
    id: str
    kind: str  # feature | rule | card | defect | test-case | learning | overview | code | endpoint | spec
    title: str
    path: str = ""


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    type: str
    weight: float


def _as_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def build(docs: Iterable[Document], tests_dir: Path = TESTS_DIR) -> tuple[list[Node], list[Edge]]:
    docs = list(docs)
    nodes: dict[str, Node] = {d.id: Node(d.id, d.type, d.title, d.path) for d in docs}
    edges: list[Edge] = []

    def add(source: str, target: str, type_: str, weight: float, kind: str) -> None:
        if target not in nodes:
            nodes[target] = Node(target, kind, target, target if kind in ("code", "spec") else "")
        edges.append(Edge(source, target, type_, weight))

    for d in docs:
        for field_name, type_, weight in FIELD_EDGES:
            for value in _as_list(d.meta.get(field_name)):
                kind = {"code": "code", "endpoints": "endpoint", "applies_to": "code"}.get(field_name, "unknown")
                add(d.id, value, type_, weight, kind)
        for link in d.links:
            if link != d.id:
                add(d.id, link, "LINKS_TO", LINK_WEIGHT, "unknown")

    # Spec files verify the features, rules and defects they tag.
    for spec in sorted(tests_dir.rglob("*.spec.ts")):
        rel = spec.relative_to(ROOT).as_posix()
        tags = sorted(set(TAG.findall(spec.read_text(encoding="utf-8"))))
        for tag in tags:
            add(rel, tag, "VERIFIES", VERIFIES_WEIGHT, "unknown")
        if tags:
            nodes[rel] = Node(rel, "spec", rel, rel)

    # A link to an id no document defines is kept as a dangling node; mark it.
    unique = {(e.source, e.target, e.type): e for e in edges}
    return list(nodes.values()), list(unique.values())


class GraphStore(Protocol):
    def neighbors(self, node_id: str, depth: int = 1) -> dict[str, float]: ...
    def node(self, node_id: str) -> Node | None: ...
    def edges_of(self, node_id: str) -> list[Edge]: ...
    def nodes(self) -> list[Node]: ...


class LocalGraph:
    def __init__(self, nodes: list[Node], edges: list[Edge]) -> None:
        self._nodes = {n.id: n for n in nodes}
        self._edges = edges
        self._adj: dict[str, list[tuple[str, float, Edge]]] = defaultdict(list)
        for e in edges:
            self._adj[e.source].append((e.target, e.weight, e))
            self._adj[e.target].append((e.source, e.weight, e))

    @classmethod
    def load(cls, path: Path = GRAPH_FILE) -> "LocalGraph":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls([Node(**n) for n in data["nodes"]], [Edge(**e) for e in data["edges"]])

    def save(self, path: Path = GRAPH_FILE) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {"nodes": [asdict(n) for n in self._nodes.values()], "edges": [asdict(e) for e in self._edges]}
        path.write_text(json.dumps(data, indent=1), encoding="utf-8")

    def neighbors(self, node_id: str, depth: int = 1) -> dict[str, float]:
        """Every node within `depth` hops, scored by the best product of edge weights along a path."""
        best: dict[str, float] = {node_id: 1.0}
        frontier = {node_id: 1.0}
        for _ in range(depth):
            nxt: dict[str, float] = {}
            for current, score in frontier.items():
                for other, weight, _ in self._adj.get(current, []):
                    s = score * weight
                    if s > best.get(other, 0.0):
                        best[other] = s
                        nxt[other] = s
            frontier = nxt
        best.pop(node_id, None)
        return best

    def node(self, node_id: str) -> Node | None:
        return self._nodes.get(node_id)

    def edges_of(self, node_id: str) -> list[Edge]:
        return [e for _, _, e in self._adj.get(node_id, [])]

    def nodes(self) -> list[Node]:
        return list(self._nodes.values())


class Neo4jGraph:
    """The same graph in Neo4j. Every node is `:Node {id}` plus a label for its kind."""

    def __init__(self) -> None:
        from neo4j import GraphDatabase

        if not NEO4J_URI:
            raise RuntimeError("NEO4J_URI is not set")
        self._driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        self._driver.verify_connectivity()

    def close(self) -> None:
        self._driver.close()

    @staticmethod
    def _label(kind: str) -> str:
        return "".join(part.capitalize() for part in re.split(r"[^a-zA-Z]+", kind) if part) or "Unknown"

    def replace(self, nodes: list[Node], edges: list[Edge]) -> None:
        with self._driver.session() as s:
            s.run("MATCH (n:Node) DETACH DELETE n")
            s.run("CREATE CONSTRAINT node_id IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE")
            by_kind: dict[str, list[dict[str, str]]] = defaultdict(list)
            for n in nodes:
                by_kind[n.kind].append(asdict(n))
            for kind, rows in by_kind.items():
                s.run(f"UNWIND $rows AS r CREATE (n:Node:{self._label(kind)}) SET n = r", rows=rows)
            by_type: dict[str, list[dict[str, object]]] = defaultdict(list)
            for e in edges:
                by_type[e.type].append(asdict(e))
            for type_, rows in by_type.items():
                s.run(
                    f"UNWIND $rows AS r MATCH (a:Node {{id: r.source}}), (b:Node {{id: r.target}}) "
                    f"CREATE (a)-[:{type_} {{weight: r.weight}}]->(b)",
                    rows=rows,
                )

    def neighbors(self, node_id: str, depth: int = 1) -> dict[str, float]:
        depth = max(1, min(int(depth), 3))
        query = (
            f"MATCH p = (s:Node {{id: $id}})-[*1..{depth}]-(n:Node) WHERE n.id <> $id "
            "RETURN n.id AS id, max(reduce(w = 1.0, r IN relationships(p) | w * r.weight)) AS score"
        )
        with self._driver.session() as s:
            return {r["id"]: float(r["score"]) for r in s.run(query, id=node_id)}

    def node(self, node_id: str) -> Node | None:
        with self._driver.session() as s:
            r = s.run("MATCH (n:Node {id: $id}) RETURN n", id=node_id).single()
            if not r:
                return None
            n = r["n"]
            return Node(n["id"], n["kind"], n["title"], n.get("path", ""))

    def edges_of(self, node_id: str) -> list[Edge]:
        with self._driver.session() as s:
            rows = s.run(
                "MATCH (a:Node)-[r]-(b:Node) WHERE a.id = $id "
                "RETURN startNode(r).id AS s, endNode(r).id AS t, type(r) AS type, r.weight AS w",
                id=node_id,
            )
            return [Edge(r["s"], r["t"], r["type"], float(r["w"])) for r in rows]

    def nodes(self) -> list[Node]:
        with self._driver.session() as s:
            return [
                Node(r["n"]["id"], r["n"]["kind"], r["n"]["title"], r["n"].get("path", ""))
                for r in s.run("MATCH (n:Node) RETURN n")
            ]


def open_graph() -> GraphStore:
    """Neo4j when configured, else the local graph saved by the last build."""
    if NEO4J_URI:
        return Neo4jGraph()
    return LocalGraph.load()
