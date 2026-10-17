"""Loads the knowledge vault: Markdown with YAML frontmatter and [[ID]] links, chunked by section."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from rag.config import KNOWLEDGE_DIR, ROOT

LINK = re.compile(r"\[\[([A-Z][A-Z0-9-]+)\]\]")
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n?", re.DOTALL)
MAX_CHUNK = 1400


@dataclass
class Document:
    id: str
    type: str
    title: str
    path: str  # repo-relative, forward slashes
    meta: dict[str, Any]
    body: str
    links: list[str] = field(default_factory=list)


@dataclass
class Chunk:
    id: str
    doc_id: str
    section: str
    text: str


def parse(path: Path, text: str) -> Document:
    m = FRONTMATTER.match(text)
    meta: dict[str, Any] = yaml.safe_load(m.group(1)) if m else {}
    if not isinstance(meta, dict):
        meta = {}
    body = text[m.end() :] if m else text
    doc_id = str(meta.get("id") or path.stem.upper())
    title = str(meta.get("title") or doc_id)
    return Document(
        id=doc_id,
        type=str(meta.get("type", "note")),
        title=title,
        path=path.resolve().relative_to(ROOT).as_posix() if path.is_absolute() else path.as_posix(),
        meta=meta,
        body=body.strip(),
        links=sorted(set(LINK.findall(body))),
    )


def is_active(doc: Document) -> bool:
    """Deprecated documents stay in the vault as history but are never retrieved."""
    return doc.meta.get("status") != "deprecated"


def load_vault(root: Path = KNOWLEDGE_DIR) -> list[Document]:
    """Every document; folders starting with `_` (curation ledger, pending proposals) are not knowledge."""
    paths = [p for p in sorted(root.rglob("*.md")) if not any(s.startswith("_") for s in p.relative_to(root).parts)]
    docs = [parse(p, p.read_text(encoding="utf-8")) for p in paths]
    ids = [d.id for d in docs]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"duplicate document ids in the vault: {sorted(dupes)}")
    return docs


def chunk(doc: Document) -> list[Chunk]:
    """One chunk per H2 section (H1 + intro is the first), split further when a section is long.

    Each chunk starts with the document title, so a chunk retrieved alone still says what it is about.
    """
    sections: list[tuple[str, str]] = []
    heading, lines = "Overview", []
    for line in doc.body.splitlines():
        if line.startswith("## "):
            sections.append((heading, "\n".join(lines)))
            heading, lines = line[3:].strip(), []
        else:
            lines.append(line)
    sections.append((heading, "\n".join(lines)))

    chunks: list[Chunk] = []
    for heading, text in sections:
        text = text.strip()
        if not text:
            continue
        parts = [text[i : i + MAX_CHUNK] for i in range(0, len(text), MAX_CHUNK)]
        for n, part in enumerate(parts):
            chunks.append(
                Chunk(
                    id=f"{doc.id}#{len(chunks)}",
                    doc_id=doc.id,
                    section=heading if len(parts) == 1 else f"{heading} ({n + 1})",
                    text=f"{doc.id}: {doc.title} › {heading}\n\n{part}",
                )
            )
    return chunks
