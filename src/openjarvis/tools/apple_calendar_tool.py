"""Apple Calendar desktop tool backed by the local macOS calendar database."""

from __future__ import annotations

import sqlite3
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_APPLE_EPOCH_OFFSET = 978_307_200


@dataclass(slots=True)
class _CalendarEvent:
    rowid: int
    title: str
    calendar_title: str
    start_cf: float
    end_cf: float
    all_day: bool
    location: str = ""
    url: str = ""


@ToolRegistry.register("calendar")
class AppleCalendarTool(BaseTool):
    """Search and list Apple Calendar events from the local macOS database."""

    tool_id = "calendar"

    def __init__(
        self,
        db_path: Optional[Path | str] = None,
        fallback_tool: Optional[BaseTool] = None,
    ) -> None:
        self._db_path = Path(db_path).expanduser() if db_path else None
        self._fallback_tool = fallback_tool

    def set_fallback_tool(self, tool: BaseTool) -> None:
        """Keep an external Calendar tool available for write operations."""
        self._fallback_tool = tool

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="calendar",
            description=(
                "Search, list, and create Apple Calendar events. Search/list "
                "reads from the local macOS Calendar database, including Google "
                "calendars synced into Apple Calendar. Create may delegate to "
                "the configured Apple Calendar automation tool."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "description": "Operation to perform: list, search, or create.",
                        "enum": ["list", "search", "create"],
                    },
                    "query": {
                        "type": "string",
                        "description": "Search term to match against events.",
                    },
                    "searchText": {
                        "type": "string",
                        "description": "Search term to match against events.",
                    },
                    "date": {
                        "type": "string",
                        "description": "Date to list, as YYYY-MM-DD.",
                    },
                    "startDate": {
                        "type": "string",
                        "description": "Start date/time as YYYY-MM-DD or ISO datetime.",
                    },
                    "endDate": {
                        "type": "string",
                        "description": "End date/time as YYYY-MM-DD or ISO datetime.",
                    },
                    "days": {
                        "type": "integer",
                        "description": (
                            "Number of days to list when no endDate is given."
                        ),
                        "default": 7,
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum events to return.",
                        "default": 20,
                    },
                    "title": {
                        "type": "string",
                        "description": "Title for an event to create.",
                    },
                },
                "required": ["operation"],
            },
            category="productivity",
        )

    def execute(self, **params: Any) -> ToolResult:
        operation = str(params.get("operation") or "").strip().lower()
        if operation == "list":
            return self._list_events(params)
        if operation == "search":
            return self._search_events(params)
        if operation in {"create", "add", "update", "delete"}:
            return self._delegate_write(params)
        return ToolResult(
            tool_name="calendar",
            content="Unknown calendar operation. Use one of: list, search, create.",
            success=False,
        )

    def _list_events(self, params: dict[str, Any]) -> ToolResult:
        db_path = self._resolve_db_path()
        if isinstance(db_path, ToolResult):
            return db_path

        try:
            start_dt, end_dt = _date_range(params)
            max_results = _max_results(params)
            with _connect_calendar_db(db_path) as conn:
                total = _count_events(conn, start_dt, end_dt)
                events = _load_events(conn, start_dt, end_dt, max_results=max_results)
        except Exception as exc:  # noqa: BLE001
            return _calendar_error(str(exc))

        if not events:
            return ToolResult(
                tool_name="calendar",
                content=(
                    "No Apple Calendar events found for "
                    f"{_format_range(start_dt, end_dt)}. "
                    "This checked the local macOS Calendar database."
                ),
                success=True,
                metadata={"num_results": 0, "total_events": total},
            )

        lines = [
            f"Apple Calendar has {total} event{'s' if total != 1 else ''} "
            f"for {_format_range(start_dt, end_dt)}. "
            f"Showing {len(events)}:"
        ]
        lines.extend(
            _format_event(index, event) for index, event in enumerate(events, 1)
        )

        return ToolResult(
            tool_name="calendar",
            content="\n".join(lines),
            success=True,
            metadata={"num_results": len(events), "total_events": total},
        )

    def _search_events(self, params: dict[str, Any]) -> ToolResult:
        db_path = self._resolve_db_path()
        if isinstance(db_path, ToolResult):
            return db_path

        query = str(params.get("query") or params.get("searchText") or "").strip()
        if not query:
            return ToolResult(
                tool_name="calendar",
                content="No query or searchText provided for calendar search.",
                success=False,
            )

        try:
            start_dt, end_dt = _date_range(params, default_days=365)
            max_results = _max_results(params)
            with _connect_calendar_db(db_path) as conn:
                events = _load_events(
                    conn,
                    start_dt,
                    end_dt,
                    max_results=max_results,
                    query=query,
                )
        except Exception as exc:  # noqa: BLE001
            return _calendar_error(str(exc))

        if not events:
            return ToolResult(
                tool_name="calendar",
                content=(
                    f"No Apple Calendar matches found for '{query}' in "
                    f"{_format_range(start_dt, end_dt)}."
                ),
                success=True,
                metadata={"num_results": 0},
            )

        lines = [f"Apple Calendar matches for '{query}':"]
        lines.extend(
            _format_event(index, event) for index, event in enumerate(events, 1)
        )
        return ToolResult(
            tool_name="calendar",
            content="\n".join(lines),
            success=True,
            metadata={"num_results": len(events)},
        )

    def _delegate_write(self, params: dict[str, Any]) -> ToolResult:
        if self._fallback_tool is not None:
            return self._fallback_tool.execute(**params)
        return ToolResult(
            tool_name="calendar",
            content=(
                "Creating or changing Apple Calendar events requires the "
                "external Apple Calendar automation tool, which is not configured."
            ),
            success=False,
        )

    def _resolve_db_path(self) -> Path | ToolResult:
        if self._db_path is not None:
            if self._db_path.exists():
                return self._db_path
            return _calendar_error(f"Calendar database not found at {self._db_path}")

        for path in _calendar_db_candidates():
            if path.exists():
                return path

        return _calendar_error(
            "Could not find the local Apple Calendar database. Make sure Calendar "
            "is set up on this Mac and OpenJarvis has Full Disk Access."
        )


def _calendar_db_candidates() -> list[Path]:
    home = Path.home()
    return [
        home / "Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb",
        home / "Library/Calendars/Calendar.sqlitedb",
    ]


def _connect_calendar_db(path: Path) -> sqlite3.Connection:
    attempts = [
        f"{path.as_uri()}?mode=ro",
        f"{path.as_uri()}?mode=ro&immutable=1",
        f"file:{path}?mode=ro",
    ]
    errors: list[str] = []
    for uri in attempts:
        try:
            conn = sqlite3.connect(uri, uri=True)
            conn.row_factory = sqlite3.Row
            return conn
        except sqlite3.Error as exc:
            errors.append(str(exc))

    detail = "; ".join(dict.fromkeys(errors))
    raise sqlite3.OperationalError(
        f"{detail}. Calendar database path: {path}. Backend runtime: {sys.executable}"
    )


def _date_range(
    params: dict[str, Any],
    *,
    default_days: int = 7,
) -> tuple[datetime, datetime]:
    local_tz = datetime.now().astimezone().tzinfo
    now = datetime.now(tz=local_tz)

    if params.get("date"):
        day = _parse_date(str(params["date"]))
        start_dt = datetime.combine(day, time.min, tzinfo=local_tz)
        return start_dt, start_dt + timedelta(days=1)

    start_dt = _parse_datetime(params.get("startDate"), default=now)
    if params.get("endDate"):
        end_dt = _parse_datetime(params.get("endDate"), default=start_dt)
        if _is_date_only(str(params["endDate"])):
            end_dt = end_dt + timedelta(days=1)
    else:
        days = _days(params, default_days)
        end_dt = start_dt + timedelta(days=days)

    if end_dt <= start_dt:
        end_dt = start_dt + timedelta(days=1)
    return start_dt, end_dt


def _parse_datetime(value: Any, *, default: datetime) -> datetime:
    if not value:
        return default

    text = str(value).strip()
    local_tz = datetime.now().astimezone().tzinfo
    if _is_date_only(text):
        return datetime.combine(_parse_date(text), time.min, tzinfo=local_tz)

    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return default
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=local_tz)
    return parsed


def _parse_date(value: str) -> date:
    return date.fromisoformat(value.strip()[:10])


def _is_date_only(value: str) -> bool:
    text = value.strip()
    return len(text) == 10 and text[4] == "-" and text[7] == "-"


def _days(params: dict[str, Any], default: int) -> int:
    try:
        value = int(params.get("days") or default)
    except (TypeError, ValueError):
        value = default
    return max(1, min(value, 365))


def _max_results(params: dict[str, Any]) -> int:
    try:
        value = int(params.get("max_results") or params.get("maxResults") or 20)
    except (TypeError, ValueError):
        value = 20
    return max(1, min(value, 100))


def _to_cf_absolute(dt: datetime) -> float:
    return dt.astimezone(timezone.utc).timestamp() - _APPLE_EPOCH_OFFSET


def _from_cf_absolute(value: float) -> datetime:
    timestamp = value + _APPLE_EPOCH_OFFSET
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).astimezone()


def _load_events(
    conn: sqlite3.Connection,
    start_dt: datetime,
    end_dt: datetime,
    *,
    max_results: int,
    query: str = "",
) -> list[_CalendarEvent]:
    start_cf = _to_cf_absolute(start_dt)
    end_cf = _to_cf_absolute(end_dt)
    like = f"%{query}%" if query else None
    events: dict[tuple[int, float], _CalendarEvent] = {}

    for row in _query_calendar_items(conn, start_cf, end_cf, max_results, like):
        event = _event_from_row(row)
        events[(event.rowid, event.start_cf)] = event

    for row in _query_occurrences(conn, start_cf, end_cf, max_results, like):
        event = _event_from_occurrence_row(row)
        events[(event.rowid, event.start_cf)] = event

    sorted_events = sorted(
        events.values(),
        key=lambda event: (event.start_cf, event.title.lower()),
    )
    return sorted_events[:max_results]


def _count_events(
    conn: sqlite3.Connection,
    start_dt: datetime,
    end_dt: datetime,
) -> int:
    start_cf = _to_cf_absolute(start_dt)
    end_cf = _to_cf_absolute(end_dt)
    seen: set[tuple[int, float]] = set()
    for row in _query_calendar_items(conn, start_cf, end_cf, 10_000, None):
        seen.add((int(row["rowid"]), float(row["start_cf"] or 0)))
    for row in _query_occurrences(conn, start_cf, end_cf, 10_000, None):
        seen.add((int(row["rowid"]), float(row["start_cf"] or 0)))
    return len(seen)


def _query_calendar_items(
    conn: sqlite3.Connection,
    start_cf: float,
    end_cf: float,
    limit: int,
    like: str | None,
) -> list[sqlite3.Row]:
    where = [
        "COALESCE(ci.hidden, 0) = 0",
        "COALESCE(s.disabled, 0) = 0",
        "ci.start_date < ?",
        "COALESCE(ci.end_date, ci.start_date) >= ?",
    ]
    args: list[Any] = [end_cf, start_cf]
    if like:
        where.append(
            "("
            "ci.summary LIKE ? OR ci.description LIKE ? OR "
            "c.title LIKE ? OR loc.title LIKE ? OR loc.address LIKE ?"
            ")"
        )
        args.extend([like, like, like, like, like])
    args.append(limit)
    return conn.execute(
        f"""
        SELECT
          ci.ROWID AS rowid,
          ci.summary AS title,
          c.title AS calendar_title,
          ci.start_date AS start_cf,
          COALESCE(ci.end_date, ci.start_date) AS end_cf,
          COALESCE(ci.all_day, 0) AS all_day,
          COALESCE(loc.title, loc.address, '') AS location,
          COALESCE(ci.url, '') AS url
        FROM CalendarItem ci
        JOIN Calendar c ON c.ROWID = ci.calendar_id
        LEFT JOIN Store s ON s.ROWID = c.store_id
        LEFT JOIN Location loc ON loc.ROWID = ci.location_id
        WHERE {' AND '.join(where)}
        ORDER BY ci.start_date ASC
        LIMIT ?
        """,
        args,
    ).fetchall()


def _query_occurrences(
    conn: sqlite3.Connection,
    start_cf: float,
    end_cf: float,
    limit: int,
    like: str | None,
) -> list[sqlite3.Row]:
    where = [
        "COALESCE(ci.hidden, 0) = 0",
        "COALESCE(s.disabled, 0) = 0",
        "oc.occurrence_start_date < ?",
        "COALESCE(oc.occurrence_end_date, oc.occurrence_start_date) >= ?",
    ]
    args: list[Any] = [end_cf, start_cf]
    if like:
        where.append(
            "("
            "ci.summary LIKE ? OR ci.description LIKE ? OR "
            "c.title LIKE ? OR loc.title LIKE ? OR loc.address LIKE ?"
            ")"
        )
        args.extend([like, like, like, like, like])
    args.append(limit)
    return conn.execute(
        f"""
        SELECT
          ci.ROWID AS rowid,
          ci.summary AS title,
          c.title AS calendar_title,
          oc.occurrence_start_date AS start_cf,
          COALESCE(oc.occurrence_end_date, oc.occurrence_start_date) AS end_cf,
          COALESCE(ci.all_day, 0) AS all_day,
          COALESCE(loc.title, loc.address, '') AS location,
          COALESCE(ci.url, '') AS url
        FROM OccurrenceCache oc
        JOIN CalendarItem ci ON ci.ROWID = oc.event_id
        JOIN Calendar c ON c.ROWID = oc.calendar_id
        LEFT JOIN Store s ON s.ROWID = c.store_id
        LEFT JOIN Location loc ON loc.ROWID = ci.location_id
        WHERE {' AND '.join(where)}
        ORDER BY oc.occurrence_start_date ASC
        LIMIT ?
        """,
        args,
    ).fetchall()


def _event_from_row(row: sqlite3.Row) -> _CalendarEvent:
    return _CalendarEvent(
        rowid=int(row["rowid"]),
        title=str(row["title"] or "Untitled event").strip(),
        calendar_title=str(row["calendar_title"] or "Calendar").strip(),
        start_cf=float(row["start_cf"] or 0),
        end_cf=float(row["end_cf"] or row["start_cf"] or 0),
        all_day=bool(row["all_day"]),
        location=str(row["location"] or "").strip(),
        url=str(row["url"] or "").strip(),
    )


def _event_from_occurrence_row(row: sqlite3.Row) -> _CalendarEvent:
    return _event_from_row(row)


def _format_event(index: int, event: _CalendarEvent) -> str:
    start = _from_cf_absolute(event.start_cf)
    end = _from_cf_absolute(event.end_cf)
    if event.all_day:
        when = start.strftime("%a %b %d").replace(" 0", " ")
    else:
        when = (
            f"{start.strftime('%a %b %d').replace(' 0', ' ')} "
            f"{start.strftime('%H:%M')}-{end.strftime('%H:%M')}"
        )

    details = [f"{index}. {when}: {event.title}", f"calendar: {event.calendar_title}"]
    if event.location:
        details.append(f"location: {event.location}")
    return f"{details[0]} ({'; '.join(details[1:])})"


def _format_range(start_dt: datetime, end_dt: datetime) -> str:
    start = start_dt.astimezone()
    end = end_dt.astimezone()
    if start.date() == (end - timedelta(seconds=1)).date():
        return start.strftime("%b %d, %Y").replace(" 0", " ")
    return (
        f"{start.strftime('%b %d, %Y').replace(' 0', ' ')} to "
        f"{end.strftime('%b %d, %Y').replace(' 0', ' ')}"
    )


def _calendar_error(message: str) -> ToolResult:
    detail = message.rstrip(" .")
    permission_hint = (
        " Check that OpenJarvis and the backend Python runtime listed above "
        "have Full Disk Access, and that Calendar is synced on this Mac."
        if "Backend runtime:" in detail
        else (
            " Check that OpenJarvis has Full Disk Access and that Calendar is "
            "synced on this Mac."
        )
    )
    return ToolResult(
        tool_name="calendar",
        content=f"Cannot inspect Apple Calendar: {detail}.{permission_hint}",
        success=False,
    )


__all__ = ["AppleCalendarTool"]
