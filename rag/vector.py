"""ChromaDB vector store over vault chunks (embedded, persisted under .rag/chroma).

Embeddings: Chroma's default all-MiniLM-L6-v2 (ONNX, runs locally, downloaded once).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import chromadb
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


class VectorStore:
    def __init__(self) -> None:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self._collection = self._client.get_or_create_collection(
            COLLECTION, embedding_function=DefaultEmbeddingFunction(), metadata={"hnsw:space": "cosine"}
        )

    def reset(self) -> None:
        self._client.delete_collection(COLLECTION)
        self._collection = self._client.get_or_create_collection(
            COLLECTION, embedding_function=DefaultEmbeddingFunction(), metadata={"hnsw:space": "cosine"}
        )

    def upsert(self, doc: Document, chunks: list[Chunk]) -> None:
        self.delete_doc(doc.id)
        if not chunks:
            return
        self._collection.upsert(
            ids=[c.id for c in chunks],
            documents=[c.text for c in chunks],
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
        res = self._collection.query(query_texts=[text], n_results=k, where=where)
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
