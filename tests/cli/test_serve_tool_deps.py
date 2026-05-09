"""Tests for desktop server tool dependency injection."""

from __future__ import annotations

from openjarvis.cli.serve import _inject_desktop_tool_deps
from openjarvis.connectors.store import KnowledgeStore
from openjarvis.tools.knowledge_search import KnowledgeSearchTool
from openjarvis.tools.storage_tools import MemorySearchTool


class _Backend:
    pass


def test_injects_memory_backend_into_memory_tools() -> None:
    backend = _Backend()
    tool = MemorySearchTool()

    _inject_desktop_tool_deps(tool, memory_backend=backend)

    assert tool._backend is backend


def test_memory_tools_fall_back_to_knowledge_store(tmp_path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    tool = MemorySearchTool()

    _inject_desktop_tool_deps(tool, memory_backend=None, knowledge_store=store)

    assert tool._backend is store


def test_injects_knowledge_store_into_knowledge_tools(tmp_path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    tool = KnowledgeSearchTool()

    _inject_desktop_tool_deps(tool, knowledge_store=store)

    assert tool._store is store
