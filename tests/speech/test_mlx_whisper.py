"""Tests for MLX Whisper speech backend."""

from unittest.mock import MagicMock, patch

import pytest

from openjarvis.core.registry import SpeechRegistry
from openjarvis.speech.mlx_whisper import MLXWhisperBackend


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
        patch("openjarvis.speech.mlx_whisper.shutil.which", return_value="/opt/homebrew/bin/ffmpeg"),
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
        patch("openjarvis.speech.mlx_whisper.shutil.which", return_value="/opt/homebrew/bin/ffmpeg"),
    ):
        result = backend.transcribe(b"fake audio", format="m4a")

    assert result.text == "Olá mundo"
    assert result.language == "pt"
    assert result.duration_seconds == 1.5
    mock_mlx.transcribe.assert_called_once_with(
        mock_mlx.transcribe.call_args.args[0],
        path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
        condition_on_previous_text=False,
        verbose=None,
    )


def test_mlx_whisper_transcribe_passes_language():
    mock_mlx = MagicMock()
    mock_mlx.transcribe.return_value = {"text": "Olá", "language": "pt", "segments": []}
    backend = MLXWhisperBackend(model_size="base")

    with (
        patch("openjarvis.speech.mlx_whisper._load_mlx_whisper", return_value=mock_mlx),
        patch("openjarvis.speech.mlx_whisper.shutil.which", return_value="/opt/homebrew/bin/ffmpeg"),
    ):
        backend.transcribe(b"fake audio", language="pt")

    mock_mlx.transcribe.assert_called_once_with(
        mock_mlx.transcribe.call_args.args[0],
        path_or_hf_repo="mlx-community/whisper-base",
        condition_on_previous_text=False,
        verbose=None,
        language="pt",
    )
