"""Tests for MLX Whisper speech backend."""

from unittest.mock import MagicMock, patch

import pytest

from openjarvis.core.registry import SpeechRegistry
from openjarvis.speech.mlx_whisper import MLXWhisperBackend, _language_window_starts

FFMPEG = "/opt/homebrew/bin/ffmpeg"


@pytest.fixture(autouse=True)
def _register_mlx_whisper():
    """Re-register after any registry clear."""
    if not SpeechRegistry.contains("mlx-whisper"):
        SpeechRegistry.register_value("mlx-whisper", MLXWhisperBackend)


def test_mlx_whisper_backend_registers():
    """Backend registers itself in SpeechRegistry."""
    assert SpeechRegistry.contains("mlx-whisper")


def test_mlx_whisper_health_requires_runtime():
    backend = MLXWhisperBackend(model_size="large-v3-turbo")

    with (
        patch("openjarvis.speech.mlx_whisper._is_apple_silicon", return_value=True),
        patch("openjarvis.speech.mlx_whisper._load_mlx_whisper", return_value=object()),
        patch("openjarvis.speech.mlx_whisper.shutil.which", return_value=FFMPEG),
    ):
        assert backend.health() is True

    with (
        patch("openjarvis.speech.mlx_whisper._is_apple_silicon", return_value=True),
        patch("openjarvis.speech.mlx_whisper._load_mlx_whisper", return_value=object()),
        patch("openjarvis.speech.mlx_whisper.shutil.which", return_value=None),
    ):
        assert backend.health() is False


def test_mlx_whisper_transcribe_uses_mlx_model_alias():
    mock_mlx = MagicMock()
    mock_mlx.transcribe.return_value = {
        "text": "Olá mundo",
        "language": "pt",
        "segments": [{"text": " Olá mundo", "start": 0.0, "end": 1.5}],
    }
    backend = MLXWhisperBackend(model_size="large-v3-turbo")

    with (
        patch("openjarvis.speech.mlx_whisper._load_mlx_whisper", return_value=mock_mlx),
        patch("openjarvis.speech.mlx_whisper.shutil.which", return_value=FFMPEG),
        patch(
            "openjarvis.speech.mlx_whisper._detect_language_from_windows",
            return_value=(None, None),
        ),
    ):
        result = backend.transcribe(b"fake audio", format="m4a")

    assert result.text == "Olá mundo"
    assert result.language == "pt"
    assert result.duration_seconds == 1.5
    mock_mlx.transcribe.assert_called_once_with(
        mock_mlx.transcribe.call_args.args[0],
        path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
        condition_on_previous_text=False,
        task="transcribe",
        verbose=None,
    )


def test_mlx_whisper_transcribe_passes_language():
    mock_mlx = MagicMock()
    mock_mlx.transcribe.return_value = {"text": "Olá", "language": "pt", "segments": []}
    backend = MLXWhisperBackend(model_size="base")

    with (
        patch("openjarvis.speech.mlx_whisper._load_mlx_whisper", return_value=mock_mlx),
        patch("openjarvis.speech.mlx_whisper.shutil.which", return_value=FFMPEG),
        patch(
            "openjarvis.speech.mlx_whisper._detect_language_from_windows"
        ) as mock_detect,
    ):
        backend.transcribe(b"fake audio", language="pt")

    mock_detect.assert_not_called()
    mock_mlx.transcribe.assert_called_once_with(
        mock_mlx.transcribe.call_args.args[0],
        path_or_hf_repo="mlx-community/whisper-base",
        condition_on_previous_text=False,
        task="transcribe",
        verbose=None,
        language="pt",
    )


def test_mlx_whisper_transcribe_auto_detects_language():
    mock_mlx = MagicMock()
    mock_mlx.transcribe.return_value = {"text": "Olá", "language": "pt", "segments": []}
    backend = MLXWhisperBackend(model_size="base")

    with (
        patch("openjarvis.speech.mlx_whisper._load_mlx_whisper", return_value=mock_mlx),
        patch("openjarvis.speech.mlx_whisper.shutil.which", return_value=FFMPEG),
        patch(
            "openjarvis.speech.mlx_whisper._detect_language_from_windows",
            return_value=("pt", 0.86),
        ),
    ):
        result = backend.transcribe(b"fake audio")

    assert result.confidence == 0.86
    mock_mlx.transcribe.assert_called_once_with(
        mock_mlx.transcribe.call_args.args[0],
        path_or_hf_repo="mlx-community/whisper-base",
        condition_on_previous_text=False,
        task="transcribe",
        verbose=None,
        language="pt",
    )


def test_language_window_starts_samples_across_long_audio():
    assert _language_window_starts(content_frames=6000, n_frames=3000) == [
        0,
        750,
        1500,
        2250,
        3000,
    ]
    assert _language_window_starts(content_frames=1000, n_frames=3000) == [0]
