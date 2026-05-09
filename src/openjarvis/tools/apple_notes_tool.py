"""Apple Notes desktop tool backed by the OpenJarvis knowledge index."""

from __future__ import annotations

from typing import Any, Optional

from openjarvis.connectors.store import KnowledgeStore
from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("notes")
class AppleNotesTool(BaseTool):
    """Search and list Apple Notes from the local OpenJarvis index."""

    tool_id = "notes"

    def __init__(
        self,
        store: Optional[KnowledgeStore] = None,
        fallback_tool: Optional[BaseTool] = None,
    ) -> None:
        self._store = store
        self._fallback_tool = fallback_tool

    def set_fallback_tool(self, tool: BaseTool) -> None:
        """Keep an external Notes tool available for operations we do not own."""
        self._fallback_tool = tool

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="notes",
            description=(
                "Search, list, and create Apple Notes. Search/list reads from "
                "OpenJarvis's synced Apple Notes index; create may delegate to "
                "the configured Apple Notes automation tool."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "description": "Operation to perform: search, list, or create.",
                        "enum": ["search", "list", "create"],
                    },
                    "searchText": {
                        "type": "string",
                        "description": "Text to search for in notes.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Title for a note to create.",
                    },
                    "body": {
                        "type": "string",
                        "description": "Content for a note to create.",
                    },
                    "folderName": {
                        "type": "string",
                        "description": "Folder for a created note.",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum notes to return for list/search.",
                        "default": 20,
                    },
                },
                "required": ["operation"],
            },
            category="knowledge",
        )

    def execute(self, **params: Any) -> ToolResult:
        operation = str(params.get("operation") or "").strip().lower()
        if operation == "list":
            return self._list_notes(params)
        if operation == "search":
            return self._search_notes(params)
        if operation == "create":
            return self._create_note(params)
        return ToolResult(
            tool_name="notes",
            content="Unknown notes operation. Use one of: list, search, create.",
            success=False,
        )

    def _list_notes(self, params: dict[str, Any]) -> ToolResult:
        store = self._require_store()
        if isinstance(store, ToolResult):
            return store

        max_results = _max_results(params)
        count = _note_count(store)
        rows = store._conn.execute(
            """
            SELECT doc_id, title, content, timestamp
            FROM knowledge_chunks
            WHERE source = 'apple_notes' AND chunk_index = 0
            ORDER BY timestamp DESC, created_at DESC
            LIMIT ?
            """,
            (max_results,),
        ).fetchall()

        if count == 0:
            return ToolResult(
                tool_name="notes",
                content=(
                    "Apple Notes is not indexed yet. Open Data Sources, sync "
                    "Apple Notes, then try again."
                ),
                success=True,
                metadata={"num_results": 0, "total_notes": 0},
            )

        lines = [
            f"Apple Notes index contains {count} notes. "
            f"Showing {len(rows)} recent notes:"
        ]
        for index, row in enumerate(rows, start=1):
            title = str(row["title"] or "Untitled note").strip()
            content = _snippet(str(row["content"] or ""), max_chars=180)
            if content:
                lines.append(f"{index}. {title}: {content}")
            else:
                lines.append(f"{index}. {title}")

        return ToolResult(
            tool_name="notes",
            content="\n".join(lines),
            success=True,
            metadata={"num_results": len(rows), "total_notes": count},
        )

    def _search_notes(self, params: dict[str, Any]) -> ToolResult:
        store = self._require_store()
        if isinstance(store, ToolResult):
            return store

        query = str(params.get("searchText") or params.get("query") or "").strip()
        if not query:
            return ToolResult(
                tool_name="notes",
                content="No searchText provided for notes search.",
                success=False,
            )

        max_results = _max_results(params)
        results = store.retrieve(query, top_k=max_results, source="apple_notes")
        if not results:
            return ToolResult(
                tool_name="notes",
                content=(
                    f"No Apple Notes matches found for '{query}'. "
                    f"Indexed Apple Notes count: {_note_count(store)}."
                ),
                success=True,
                metadata={"num_results": 0, "total_notes": _note_count(store)},
            )

        lines = [f"Apple Notes matches for '{query}':"]
        for index, result in enumerate(results, start=1):
            title = str(result.metadata.get("title") or "Untitled note").strip()
            lines.append(f"{index}. {title}: {_snippet(result.content)}")

        return ToolResult(
            tool_name="notes",
            content="\n".join(lines),
            success=True,
            metadata={"num_results": len(results), "total_notes": _note_count(store)},
        )

    def _create_note(self, params: dict[str, Any]) -> ToolResult:
        if self._fallback_tool is not None:
            return self._fallback_tool.execute(**params)
        return ToolResult(
            tool_name="notes",
            content=(
                "Creating Apple Notes requires the external Apple Notes "
                "automation tool, which is not configured."
            ),
            success=False,
        )

    def _require_store(self) -> KnowledgeStore | ToolResult:
        if self._store is None:
            return ToolResult(
                tool_name="notes",
                content="No Apple Notes knowledge store configured.",
                success=False,
            )
        return self._store


def _max_results(params: dict[str, Any]) -> int:
    try:
        value = int(params.get("max_results") or params.get("maxResults") or 20)
    except (TypeError, ValueError):
        value = 20
    return max(1, min(value, 50))


def _note_count(store: KnowledgeStore) -> int:
    row = store._conn.execute(
        "SELECT COUNT(DISTINCT doc_id) FROM knowledge_chunks "
        "WHERE source = 'apple_notes'"
    ).fetchone()
    return int(row[0] or 0) if row else 0


def _snippet(content: str, *, max_chars: int = 500) -> str:
    text = " ".join(content.split())
    if len(text) > max_chars:
        text = text[: max_chars - 3].rstrip() + "..."
    return text


__all__ = ["AppleNotesTool"]
