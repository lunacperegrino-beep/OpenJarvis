"""Tests for desktop personal-data context injection."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from openjarvis.connectors.store import KnowledgeStore  # noqa: E402
from openjarvis.core.types import ToolResult  # noqa: E402
from openjarvis.server.app import create_app  # noqa: E402
from openjarvis.server.personal_context import (  # noqa: E402
    build_personal_data_context,
)


def _store_music_track(
    store: KnowledgeStore,
    *,
    name: str,
    artist: str,
    play_count: int,
    genre: str = "",
) -> None:
    store.store(
        json.dumps(
            {
                "name": name,
                "artist": artist,
                "album": "Test Album",
                "genre": genre,
                "play_count": play_count,
            }
        ),
        source="apple_music",
        doc_type="track",
        title=f"{name} — {artist}",
        author=artist,
        metadata={"play_count": play_count, "genre": genre},
    )


def test_apple_music_context_ranks_artists_by_play_count(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    _store_music_track(store, name="Song A", artist="Artist Low", play_count=4)
    _store_music_track(store, name="Song B", artist="Artist High", play_count=12)
    _store_music_track(store, name="Song C", artist="Artist High", play_count=8)

    context = build_personal_data_context(
        "What artists do I listen to most?",
        store,
    )

    assert "Top Apple Music artists by play count" in context
    assert "Artist High: 20 plays across 2 tracks" in context
    assert context.index("Artist High") < context.index("Artist Low")


def test_apple_music_context_falls_back_to_track_count(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    _store_music_track(store, name="Song A", artist="Artist One", play_count=0)
    _store_music_track(store, name="Song B", artist="Artist One", play_count=0)
    _store_music_track(store, name="Song C", artist="Artist Two", play_count=0)

    context = build_personal_data_context(
        "Which artists are in my music library?",
        store,
    )

    assert "fallback ranking is by indexed track count" in context
    assert "Artist One: 2 tracks" in context


def test_notes_query_includes_apple_notes_snippets(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    store.store(
        "Dentist appointment notes mention follow-up paperwork.",
        source="apple_notes",
        doc_type="note",
        title="Dentist follow up",
    )

    context = build_personal_data_context(
        "What do my notes say about dentist paperwork?",
        store,
    )

    assert "Relevant Apple Notes snippets" in context
    assert "Dentist follow up" in context
    assert "follow-up paperwork" in context


def test_notes_query_reports_connected_when_no_readable_match(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    store.store(
        "%%%% ((( \x00 \x01",
        source="apple_notes",
        doc_type="note",
        title="Unreadable",
    )

    context = build_personal_data_context(
        "What do my Apple Notes say about travel?",
        store,
    )

    assert "Apple Notes is connected and indexed" in context
    assert "no readable exact matches" in context


def test_calendar_query_includes_local_calendar_context(monkeypatch) -> None:
    class FakeCalendarTool:
        def execute(self, **params):
            assert params["operation"] == "list"
            assert params["days"] == 7
            return ToolResult(
                tool_name="calendar",
                content="Apple Calendar has 1 event for this week.",
                success=True,
            )

    monkeypatch.setattr(
        "openjarvis.server.personal_context._make_apple_calendar_tool",
        lambda: FakeCalendarTool(),
    )

    context = build_personal_data_context(
        "Can you check my calendar for the week?",
        None,
    )

    assert "Apple Calendar local context" in context
    assert "Apple Calendar has 1 event" in context
    assert "do not claim you lack access" in context


def test_unrelated_query_does_not_inject_context(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    _store_music_track(store, name="Song A", artist="Artist One", play_count=9)

    context = build_personal_data_context("Explain FastAPI routing", store)

    assert context == ""


def test_chat_route_injects_apple_music_context(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db")
    _store_music_track(store, name="Song A", artist="Artist One", play_count=9)

    engine = MagicMock()
    engine.engine_id = "mock"
    engine.health.return_value = True
    engine.list_models.return_value = ["test-model"]
    engine.generate.return_value = {
        "content": "Artist One is your top artist.",
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
        "model": "test-model",
        "finish_reason": "stop",
    }

    app = create_app(engine, "test-model", knowledge_store=store)
    client = TestClient(app)

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "test-model",
            "messages": [
                {"role": "user", "content": "What artists do I listen to most?"}
            ],
        },
    )

    assert response.status_code == 200
    messages = engine.generate.call_args.args[0]
    assert messages[0].role.value == "system"
    assert "Apple Music library context" in messages[0].content
    assert "Artist One: 9 plays across 1 track" in messages[0].content


def test_chat_route_injects_calendar_context(tmp_path: Path, monkeypatch) -> None:
    class FakeCalendarTool:
        def execute(self, **params):
            return ToolResult(
                tool_name="calendar",
                content="Apple Calendar has 2 events for this week.",
                success=True,
            )

    monkeypatch.setattr(
        "openjarvis.server.personal_context._make_apple_calendar_tool",
        lambda: FakeCalendarTool(),
    )

    store = KnowledgeStore(tmp_path / "knowledge.db")
    engine = MagicMock()
    engine.engine_id = "mock"
    engine.health.return_value = True
    engine.list_models.return_value = ["test-model"]
    engine.generate.return_value = {
        "content": "You have 2 events this week.",
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
        "model": "test-model",
        "finish_reason": "stop",
    }

    app = create_app(engine, "test-model", knowledge_store=store)
    client = TestClient(app)

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "test-model",
            "messages": [
                {"role": "user", "content": "Can you check my calendar for the week?"}
            ],
        },
    )

    assert response.status_code == 200
    messages = engine.generate.call_args.args[0]
    assert messages[0].role.value == "system"
    assert "Apple Calendar local context" in messages[0].content
    assert "Apple Calendar has 2 events" in messages[0].content
