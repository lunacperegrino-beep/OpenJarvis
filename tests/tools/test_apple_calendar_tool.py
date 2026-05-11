"""Tests for the desktop Apple Calendar tool."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec
from openjarvis.tools.apple_calendar_tool import AppleCalendarTool

_APPLE_EPOCH_OFFSET = 978_307_200


class _CreateFallbackTool(BaseTool):
    tool_id = "calendar"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(name="calendar", description="fallback")

    def execute(self, **params):
        return ToolResult(
            tool_name="calendar",
            content=f"created {params.get('title')}",
            success=True,
        )


def _cf(dt: datetime) -> float:
    return dt.astimezone(timezone.utc).timestamp() - _APPLE_EPOCH_OFFSET


def _create_calendar_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE Store (
            ROWID INTEGER PRIMARY KEY,
            disabled INTEGER
        );
        CREATE TABLE Calendar (
            ROWID INTEGER PRIMARY KEY,
            store_id INTEGER,
            title TEXT
        );
        CREATE TABLE Location (
            ROWID INTEGER PRIMARY KEY,
            title TEXT,
            address TEXT
        );
        CREATE TABLE CalendarItem (
            ROWID INTEGER PRIMARY KEY,
            summary TEXT,
            description TEXT,
            start_date REAL,
            end_date REAL,
            all_day INTEGER,
            calendar_id INTEGER,
            hidden INTEGER,
            location_id INTEGER,
            url TEXT
        );
        CREATE TABLE OccurrenceCache (
            event_id INTEGER,
            calendar_id INTEGER,
            occurrence_start_date REAL,
            occurrence_end_date REAL
        );
        """
    )
    conn.execute("INSERT INTO Store VALUES (1, 0)")
    conn.execute("INSERT INTO Calendar VALUES (1, 1, 'Personal')")
    conn.execute("INSERT INTO Location VALUES (1, 'Clinic', '')")
    conn.commit()
    conn.close()


def _insert_event(
    path: Path,
    *,
    title: str,
    start: datetime,
    end: datetime,
    hidden: int = 0,
) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        INSERT INTO CalendarItem (
            summary, description, start_date, end_date, all_day, calendar_id,
            hidden, location_id, url
        ) VALUES (?, '', ?, ?, 0, 1, ?, 1, '')
        """,
        (title, _cf(start), _cf(end), hidden),
    )
    conn.commit()
    conn.close()


def test_calendar_list_reads_local_apple_calendar_db(tmp_path) -> None:
    db_path = tmp_path / "Calendar.sqlitedb"
    _create_calendar_db(db_path)
    now = datetime.now(timezone.utc)
    _insert_event(
        db_path,
        title="Doctor appointment",
        start=now + timedelta(days=1),
        end=now + timedelta(days=1, hours=1),
    )
    _insert_event(
        db_path,
        title="Hidden event",
        start=now + timedelta(days=1),
        end=now + timedelta(days=1, hours=1),
        hidden=1,
    )

    result = AppleCalendarTool(db_path).execute(operation="list", days=7)

    assert result.success
    assert result.metadata == {"num_results": 1, "total_events": 1}
    assert "Doctor appointment" in result.content
    assert "Hidden event" not in result.content


def test_calendar_search_reads_local_apple_calendar_db(tmp_path) -> None:
    db_path = tmp_path / "Calendar.sqlitedb"
    _create_calendar_db(db_path)
    now = datetime.now(timezone.utc)
    _insert_event(
        db_path,
        title="Medication follow up",
        start=now + timedelta(days=2),
        end=now + timedelta(days=2, hours=1),
    )

    result = AppleCalendarTool(db_path).execute(
        operation="search",
        query="Medication",
        days=30,
    )

    assert result.success
    assert result.metadata == {"num_results": 1}
    assert "Medication follow up" in result.content


def test_calendar_create_delegates_to_fallback_tool(tmp_path) -> None:
    db_path = tmp_path / "Calendar.sqlitedb"
    _create_calendar_db(db_path)
    tool = AppleCalendarTool(db_path, fallback_tool=_CreateFallbackTool())

    result = tool.execute(operation="create", title="New event")

    assert result.success
    assert result.content == "created New event"


def test_calendar_permission_error_names_backend_runtime(
    tmp_path,
    monkeypatch,
) -> None:
    runtime_target = tmp_path / "python3.13"
    runtime_link = tmp_path / "python3"
    runtime_target.touch()
    runtime_link.symlink_to(runtime_target)
    monkeypatch.setattr(
        "openjarvis.tools.apple_calendar_tool.sys.executable",
        str(runtime_link),
    )

    result = AppleCalendarTool(tmp_path).execute(operation="list", days=1)

    assert not result.success
    assert "Calendar database path:" in result.content
    assert "Backend runtime:" in result.content
    assert "Resolved backend runtime:" in result.content
    assert "backend Python runtime" in result.content
    assert "This is a permission error, not an empty calendar" in result.content
    assert "System Settings > Privacy & Security > Full Disk Access" in result.content
    assert "Full Disk Access" in result.content
