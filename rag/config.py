"""Paths and backend selection, all overridable by environment variables."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = Path(os.environ.get("KNOWLEDGE_DIR", ROOT / "knowledge"))
TESTS_DIR = ROOT / "tests"
RAG_DIR = Path(os.environ.get("RAG_DIR", ROOT / ".rag"))
CHROMA_DIR = RAG_DIR / "chroma"
GRAPH_FILE = RAG_DIR / "graph.json"
COLLECTION = "knowledge"

# Neo4j is used when NEO4J_URI is set; otherwise the graph lives in memory (built from graph.json).
NEO4J_URI = os.environ.get("NEO4J_URI")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "")

# Reciprocal-rank-fusion constant: higher flattens the difference between ranks.
RRF_K = 60
