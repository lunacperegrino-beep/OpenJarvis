"""MLX Whisper speech-to-text backend for Apple Silicon Macs."""

from __future__ import annotations

import platform
import shutil
import tempfile
from typing import Any, List, Optional

from openjarvis.core.registry import SpeechRegistry
from openjarvis.speech._stubs import Segment, SpeechBackend, TranscriptionResult

_MODEL_ALIASES = {
    "tiny": "mlx-community/whisper-tiny",
    "base": "mlx-community/whisper-base",
    "small": "mlx-community/whisper-small",
    "medium": "mlx-community/whisper-medium",
    "large-v3": "mlx-community/whisper-large-v3",
    "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
    "turbo": "mlx-community/whisper-large-v3-turbo",
}

_MLX_WHISPER: Any = None
_MLX_IMPORT_ERROR: Optional[BaseException] = None
_MLX_IMPORT_ATTEMPTED = False


def _is_apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine() == "arm64"


def _resolve_model(model_size: str) -> str:
    return _MODEL_ALIASES.get(model_size, model_size)


def _load_mlx_whisper() -> Any:
    """Import mlx-whisper only when the backend is actually inspected."""
    global _MLX_IMPORT_ATTEMPTED, _MLX_IMPORT_ERROR, _MLX_WHISPER

    if _MLX_IMPORT_ATTEMPTED:
        return _MLX_WHISPER

    _MLX_IMPORT_ATTEMPTED = True
    try:
        import mlx_whisper
    except Exception as exc:
        _MLX_IMPORT_ERROR = exc
        _MLX_WHISPER = None
    else:
        _MLX_IMPORT_ERROR = None
        _MLX_WHISPER = mlx_whisper
    return _MLX_WHISPER


@SpeechRegistry.register("mlx-whisper")
class MLXWhisperBackend(SpeechBackend):
    """Local speech-to-text using MLX Whisper on Apple Silicon."""

    backend_id = "mlx-whisper"

    def __init__(self, model_size: str = "base") -> None:
        self._model_size = model_size
        self._model_repo = _resolve_model(model_size)
        self._device = "mlx"
        self._compute_type = "float16"

    def transcribe(
        self,
        audio: bytes,
        *,
        format: str = "wav",
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """Transcribe audio bytes using MLX Whisper."""
        mlx_whisper = _load_mlx_whisper()
        if mlx_whisper is None:
            detail = f": {_MLX_IMPORT_ERROR}" if _MLX_IMPORT_ERROR else ""
            raise ImportError(
                "mlx-whisper is not available"
                f"{detail}. Install with: uv sync --extra speech-mlx"
            )
        if shutil.which("ffmpeg") is None:
            raise RuntimeError("mlx-whisper requires ffmpeg in PATH")

        suffix = f".{format}" if not format.startswith(".") else format
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(audio)
            tmp.flush()

            kwargs: dict[str, Any] = {
                "path_or_hf_repo": self._model_repo,
                "condition_on_previous_text": False,
                "verbose": None,
            }
            if language:
                kwargs["language"] = language

            result = mlx_whisper.transcribe(tmp.name, **kwargs)

        raw_segments = result.get("segments") or []
        segments = [
            Segment(
                text=str(segment.get("text", "")).strip(),
                start=float(segment.get("start", 0.0) or 0.0),
                end=float(segment.get("end", 0.0) or 0.0),
                confidence=None,
            )
            for segment in raw_segments
        ]
        duration = max((segment.end for segment in segments), default=0.0)

        return TranscriptionResult(
            text=str(result.get("text", "")).strip(),
            language=result.get("language"),
            confidence=None,
            duration_seconds=duration,
            segments=segments,
        )

    def health(self) -> bool:
        """Check if MLX Whisper can run on this machine."""
        return (
            _is_apple_silicon()
            and shutil.which("ffmpeg") is not None
            and _load_mlx_whisper() is not None
        )

    def supported_formats(self) -> List[str]:
        """Supported formats depend on ffmpeg."""
        return ["wav", "mp3", "m4a", "ogg", "flac", "webm", "aac", "mp4"]
