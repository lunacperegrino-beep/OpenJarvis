"""MLX Whisper speech-to-text backend for Apple Silicon Macs."""

from __future__ import annotations

import importlib
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
_AUTO_DETECT_WINDOWS = 5


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


def _language_window_starts(
    content_frames: int,
    n_frames: int,
    *,
    windows: int = _AUTO_DETECT_WINDOWS,
) -> List[int]:
    """Return evenly spaced 30-second language detection window starts."""
    max_start = max(0, content_frames - n_frames)
    if max_start == 0 or windows <= 1:
        return [0]
    return sorted({round(max_start * i / (windows - 1)) for i in range(windows)})


def _detect_language_from_windows(
    audio_path: str,
    model_repo: str,
) -> tuple[Optional[str], Optional[float]]:
    """Detect language from several windows instead of only the first 30s."""
    try:
        mx = importlib.import_module("mlx.core")
        audio_module = importlib.import_module("mlx_whisper.audio")
        transcribe_module = importlib.import_module("mlx_whisper.transcribe")

        model = transcribe_module.ModelHolder.get_model(model_repo, dtype=mx.float16)
        if not getattr(model, "is_multilingual", False):
            return "en", 1.0

        mel = audio_module.log_mel_spectrogram(
            audio_path,
            n_mels=model.dims.n_mels,
            padding=audio_module.N_SAMPLES,
        )
        content_frames = max(0, int(mel.shape[-2] - audio_module.N_FRAMES))
        starts = _language_window_starts(content_frames, audio_module.N_FRAMES)
        scores: dict[str, float] = {}

        for start in starts:
            mel_segment = audio_module.pad_or_trim(
                mel[start : start + audio_module.N_FRAMES],
                audio_module.N_FRAMES,
                axis=-2,
            ).astype(mx.float16)
            _, probabilities = model.detect_language(mel_segment)
            for language, probability in probabilities.items():
                scores[language] = scores.get(language, 0.0) + float(probability)

        if not scores:
            return None, None

        language, score = max(scores.items(), key=lambda item: item[1])
        confidence = score / max(len(starts), 1)
        return language, confidence
    except Exception:
        return None, None


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
                "task": "transcribe",
                "verbose": None,
            }
            language_confidence = None
            if language:
                kwargs["language"] = language
            else:
                detected_language, language_confidence = _detect_language_from_windows(
                    tmp.name,
                    self._model_repo,
                )
                if detected_language:
                    kwargs["language"] = detected_language

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
            confidence=language_confidence,
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
