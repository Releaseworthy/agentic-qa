"""The knowledge MCP server's write path: QA artifacts only, in their own folders, and nothing over a read-only endpoint."""

from __future__ import annotations

from pathlib import Path

import pytest

from rag import server
from rag.vault import parse

DEFECT = """---
id: {id}
type: defect
title: Something is wrong
status: {status}
severity: {severity}
feature: FEAT-CART
---

# Something is wrong
"""


def defect(id: str = "DEF-003", status: str = "new", severity: str = "high") -> str:
    return DEFECT.format(id=id, status=status, severity=severity)


def check(path: str, content: str) -> None:
    server.check_artifact(path, parse(Path(path), content))


def test_a_defect_in_its_folder_is_accepted() -> None:
    check("knowledge/defects/DEF-003.md", defect())


def test_content_claiming_to_be_a_defect_cannot_overwrite_a_rule() -> None:
    with pytest.raises(ValueError, match="lives in knowledge/defects/"):
        check("knowledge/rules/BR-SHIP-01.md", defect(id="BR-SHIP-01"))
    with pytest.raises(ValueError, match="id matches"):
        check("knowledge/defects/BR-SHIP-01.md", defect(id="BR-SHIP-01"))


def test_a_path_that_climbs_out_of_its_folder_is_refused() -> None:
    with pytest.raises(ValueError, match="lives in knowledge/defects/"):
        check("knowledge/defects/../rules/BR-SHIP-01.md", defect(id="DEF-999"))
    with pytest.raises(ValueError, match="lives in knowledge/defects/"):
        check("knowledge/defects/../../README.md", defect(id="DEF-999"))


def test_the_file_is_named_after_its_id() -> None:
    with pytest.raises(ValueError, match="named after its id"):
        check("knowledge/defects/DEF-001.md", defect(id="DEF-777"))


def test_a_file_that_holds_another_document_is_not_overwritten(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    folder = tmp_path / "knowledge" / "defects"
    folder.mkdir(parents=True)
    (folder / "DEF-005.md").write_text(defect(id="DEF-004"), encoding="utf-8")
    monkeypatch.setattr(server, "ROOT", tmp_path)
    with pytest.raises(ValueError, match="holds DEF-004"):
        check("knowledge/defects/DEF-005.md", defect(id="DEF-005"))


def test_enums_the_gate_ranks_on_are_checked() -> None:
    with pytest.raises(ValueError, match="severity"):
        check("knowledge/defects/DEF-003.md", defect(severity="High"))
    with pytest.raises(ValueError, match="status"):
        check("knowledge/defects/DEF-003.md", defect(status="done"))


def test_a_read_only_endpoint_refuses_every_write(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(server, "READ_ONLY", True)
    with pytest.raises(ValueError, match="read-only"):
        server.upsert_document("knowledge/defects/DEF-003.md", defect())
    with pytest.raises(ValueError, match="read-only"):
        server.commit_knowledge("PROP-20261017-abcdef", "accept", {}, "x")
