"""Tests for the desktop Apple Notes tool."""

from __future__ import annotations

from openjarvis.connectors.store import KnowledgeStore
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec
from openjarvis.tools.apple_notes_tool import AppleNotesTool


class _CreateFallbackTool(BaseTool):
    tool_id = "notes"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(name="notes", description="fallback")

    def execute(self, **params):
        return ToolResult(
            tool_name="notes",
            content=f"created {params.get('title')}",
            success=True,
        )


def _store_note(
    store: KnowledgeStore,
    *,
    doc_id: str,
    title: str,
    content: str,
) -> None:
    store.store(
        content,
        source="apple_notes",
        doc_type="note",
        doc_id=doc_id,
        title=title,
    )


def test_notes_list_reads_from_knowledge_store(tmp_path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    _store_note(
        store,
        doc_id="note-1",
        title="Doctor appointment",
        content="Bring the referral paperwork and medication list.",
    )
    _store_note(
        store,
        doc_id="note-2",
        title="Project ideas",
        content="Draft desktop sidebar improvements.",
    )

    result = AppleNotesTool(store).execute(operation="list")

    assert result.success
    assert "Apple Notes index contains 2 notes" in result.content
    assert "Doctor appointment" in result.content
    assert "Project ideas" in result.content


def test_notes_search_reads_from_knowledge_store(tmp_path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    _store_note(
        store,
        doc_id="note-1",
        title="Doctor appointment",
        content="Bring the referral paperwork and medication list.",
    )

    result = AppleNotesTool(store).execute(
        operation="search",
        searchText="referral paperwork",
    )

    assert result.success
    assert "Apple Notes matches" in result.content
    assert "Doctor appointment" in result.content


def test_notes_create_delegates_to_fallback_tool(tmp_path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    tool = AppleNotesTool(store, fallback_tool=_CreateFallbackTool())

    result = tool.execute(operation="create", title="New note", body="Hello")

    assert result.success
    assert result.content == "created New note"
