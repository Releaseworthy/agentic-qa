"""ChromaDB vector store over vault chunks (embedded, persisted under .rag/chroma).

Embeddings: Chroma's default all-MiniLM-L6-v2 (ONNX, runs locally, downloaded once).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from functools import cache
from typing import Any

import chromadb
from chromadb.api import ClientAPI
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

from rag.config import CHROMA_DIR, COLLECTION
from rag.vault import Chunk, Document


@dataclass
class VectorHit:
    chunk_id: str
    doc_id: str
    section: str
    text: str
    distance: float


@cache
def _embedder() -> DefaultEmbeddingFunction:
    """One ONNX model per process: loading it per collection made every what-if index cost ~30 s."""
    return DefaultEmbeddingFunction()


# Chunk text → embedding, per process: a what-if index re-embeds only the chunks a proposal changes.
_EMBEDDED: dict[str, Any] = {}


@cache
def _query_embedding(text: str) -> Any:
    """Queries go through the cached model too: left to Chroma, every query built a new ONNX session (~0.15 s),
    and the knowledge gate asks the golden set twice per proposal."""
    return _embedder()([text])[0]


class VectorStore:
    """The persisted index by default; `shadow()` gives a throwaway in-memory copy for what-if evaluation."""

    def __init__(self, client: ClientAPI | None = None, collection: str = COLLECTION) -> None:
        if client is None:
            CHROMA_DIR.mkdir(parents=True, exist_ok=True)
            client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self._client = client
        self._name = collection
        self._collection = self._open()

    @classmethod
    def shadow(cls) -> "VectorStore":
        return cls(chromadb.EphemeralClient(), f"shadow-{uuid.uuid4().hex[:12]}")

    def _open(self) -> Any:
        return self._client.get_or_create_collection(
            self._name, embedding_function=_embedder(), metadata={"hnsw:space": "cosine"}
        )

    def reset(self) -> None:
        self._client.delete_collection(self._name)
        self._collection = self._open()

    def drop(self) -> None:
        self._client.delete_collection(self._name)

    def upsert(self, doc: Document, chunks: list[Chunk]) -> None:
        self.delete_doc(doc.id)
        if not chunks:
            return
        texts = [c.text for c in chunks]
        missing = [t for t in dict.fromkeys(texts) if t not in _EMBEDDED]
        if missing:
            _EMBEDDED.update(zip(missing, _embedder()(missing)))
        self._collection.upsert(
            ids=[c.id for c in chunks],
            documents=texts,
            embeddings=[_EMBEDDED[t] for t in texts],
            metadatas=[
                {"doc_id": doc.id, "type": doc.type, "title": doc.title, "path": doc.path, "section": c.section}
                for c in chunks
            ],
        )

    def delete_doc(self, doc_id: str) -> None:
        self._collection.delete(where={"doc_id": doc_id})

    def query(self, text: str, k: int = 8, types: list[str] | None = None) -> list[VectorHit]:
        where: Any = None
        if types:
            where = {"type": types[0]} if len(types) == 1 else {"type": {"$in": types}}
        res = self._collection.query(query_embeddings=[_query_embedding(text)], n_results=k, where=where)
        hits: list[VectorHit] = []
        ids = res["ids"][0]
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        for i, chunk_id in enumerate(ids):
            meta = metas[i] or {}
            hits.append(
                VectorHit(chunk_id, str(meta["doc_id"]), str(meta.get("section", "")), docs[i] or "", float(dists[i]))
            )
        return hits

    def count(self) -> int:
        return self._collection.count()
