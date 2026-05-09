"""Personal-data context helpers for desktop chat requests."""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

from openjarvis.connectors.store import KnowledgeStore

_MUSIC_TERMS = (
    "apple music",
    "music",
    "song",
    "songs",
    "artist",
    "artists",
    "album",
    "albums",
    "genre",
    "genres",
    "listen",
    "listened",
    "listening",
    "played",
)
_MUSIC_RANKING_TERMS = (
    "most",
    "top",
    "favorite",
    "favourite",
    "often",
    "frequent",
    "usually",
    "habit",
    "habits",
    "rank",
    "ranking",
)
_NOTES_TERMS = (
    "apple notes",
    "my notes",
    "notes app",
    "note",
    "notes",
    "notas",
)
_SEARCH_STOPWORDS = {
    "about",
    "and",
    "are",
    "como",
    "com",
    "das",
    "dos",
    "for",
    "from",
    "how",
    "minhas",
    "meu",
    "meus",
    "minha",
    "my",
    "notes",
    "nota",
    "notas",
    "que",
    "say",
    "the",
    "what",
    "where",
    "with",
}


@dataclass(slots=True)
class _Track:
    name: str
    artist: str
    album: str = ""
    genre: str = ""
    play_count: int = 0
    played_date: str = ""


def build_personal_data_context(query: str, store: KnowledgeStore | None) -> str:
    """Return local connector context relevant to *query*.

    This is intentionally conservative: it only injects context for questions
    that clearly target indexed personal sources, so unrelated chats stay clean.
    """
    if store is None:
        return ""

    query_l = query.lower()
    parts: list[str] = []

    if _looks_like_music_query(query_l):
        music_context = _build_apple_music_context(store)
        if music_context:
            parts.append(music_context)

    if _looks_like_notes_query(query_l):
        notes_context = _build_apple_notes_context(query, store)
        if notes_context:
            parts.append(notes_context)

    if not parts:
        return ""

    return (
        "Local indexed personal data is available for this request. Use it when "
        "answering, and do not claim you lack access to Apple Music or Apple "
        "Notes when the relevant context below is present. If the context is "
        "insufficient, say exactly what is missing.\n\n"
        + "\n\n".join(parts)
    )


def _looks_like_music_query(query_l: str) -> bool:
    has_music_term = any(term in query_l for term in _MUSIC_TERMS)
    has_rank_term = any(term in query_l for term in _MUSIC_RANKING_TERMS)
    has_personal_term = any(
        term in query_l
        for term in (
            "i ",
            "i'",
            "my ",
            "me ",
            "do i",
            "did i",
            "what artists",
            "which artists",
        )
    )
    return has_music_term and (has_rank_term or has_personal_term)


def _looks_like_notes_query(query_l: str) -> bool:
    return any(term in query_l for term in _NOTES_TERMS)


def _build_apple_music_context(store: KnowledgeStore) -> str:
    tracks = _load_apple_music_tracks(store)
    if not tracks:
        return ""

    artist_play_counts: dict[str, int] = defaultdict(int)
    artist_track_counts: Counter[str] = Counter()
    genre_counts: Counter[str] = Counter()

    for track in tracks:
        artist_play_counts[track.artist] += track.play_count
        artist_track_counts[track.artist] += 1
        if track.genre:
            genre_counts[track.genre] += max(1, track.play_count or 1)

    any_play_counts = any(track.play_count > 0 for track in tracks)
    lines = [
        f"Apple Music library context ({len(tracks)} indexed tracks):",
    ]

    if any_play_counts:
        top_artists = sorted(
            artist_play_counts.items(),
            key=lambda item: (item[1], artist_track_counts[item[0]], item[0].lower()),
            reverse=True,
        )[:10]
        lines.append("Top Apple Music artists by play count:")
        for index, (artist, plays) in enumerate(top_artists, start=1):
            track_word = "track" if artist_track_counts[artist] == 1 else "tracks"
            lines.append(
                f"{index}. {artist}: {plays} plays across "
                f"{artist_track_counts[artist]} {track_word}"
            )

        top_tracks = sorted(
            tracks,
            key=lambda track: (
                track.play_count,
                track.artist.lower(),
                track.name.lower(),
            ),
            reverse=True,
        )[:10]
        lines.append("Top Apple Music tracks by play count:")
        for index, track in enumerate(top_tracks, start=1):
            lines.append(
                f"{index}. {track.name} - {track.artist}: {track.play_count} plays"
            )
    else:
        top_artists_by_tracks = artist_track_counts.most_common(10)
        lines.append(
            "Play counts are missing or zero, so the fallback ranking is by "
            "indexed track count:"
        )
        for index, (artist, count) in enumerate(top_artists_by_tracks, start=1):
            track_word = "track" if count == 1 else "tracks"
            lines.append(f"{index}. {artist}: {count} {track_word}")

    if genre_counts:
        lines.append("Top genres in the indexed Apple Music data:")
        for index, (genre, count) in enumerate(genre_counts.most_common(5), start=1):
            lines.append(f"{index}. {genre}: {count}")

    return "\n".join(lines)


def _load_apple_music_tracks(store: KnowledgeStore) -> list[_Track]:
    try:
        rows = store._conn.execute(
            """
            SELECT doc_id, title, author, content, metadata
            FROM knowledge_chunks
            WHERE source = 'apple_music' AND chunk_index = 0
            ORDER BY created_at DESC
            """
        ).fetchall()
    except Exception:
        return []

    tracks: list[_Track] = []
    seen_doc_ids: set[str] = set()
    for row in rows:
        doc_id = str(row["doc_id"] or "")
        if doc_id and doc_id in seen_doc_ids:
            continue
        if doc_id:
            seen_doc_ids.add(doc_id)

        content = _json_obj(row["content"])
        metadata = _json_obj(row["metadata"])
        title = str(row["title"] or "")
        fallback_name = title.split(" — ", 1)[0].strip() if title else ""
        track = _Track(
            name=str(content.get("name") or metadata.get("name") or fallback_name),
            artist=str(
                content.get("artist") or row["author"] or metadata.get("author")
            ),
            album=str(content.get("album") or metadata.get("album") or ""),
            genre=str(content.get("genre") or metadata.get("genre") or ""),
            play_count=_to_int(
                content.get("play_count", metadata.get("play_count", 0))
            ),
            played_date=str(
                content.get("played_date") or metadata.get("played_date") or ""
            ),
        )
        if track.name and track.artist:
            tracks.append(track)

    return tracks


def _build_apple_notes_context(query: str, store: KnowledgeStore) -> str:
    try:
        results = store.retrieve(
            _search_query_terms(query),
            top_k=8,
            source="apple_notes",
        )
    except Exception:
        return ""

    if not results:
        return ""

    lines = ["Relevant Apple Notes snippets:"]
    for index, result in enumerate(results, start=1):
        title = str(result.metadata.get("title") or "").strip()
        heading = f"{index}. {title}" if title else f"{index}."
        content = " ".join(result.content.split())
        if len(content) > 700:
            content = content[:697].rstrip() + "..."
        lines.append(f"{heading} {content}")

    return "\n".join(lines)


def _json_obj(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _search_query_terms(query: str) -> str:
    words = re.findall(r"[\wÀ-ÿ']+", query.lower())
    terms = [
        word
        for word in words
        if len(word) > 2 and word not in _SEARCH_STOPWORDS
    ]
    return " ".join(terms) or query


def _to_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0
