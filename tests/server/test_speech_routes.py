"""Tests for speech API endpoints."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

fastapi = pytest.importorskip("fastapi")

from fastapi.testclient import TestClient  # noqa: E402

from openjarvis.speech._stubs import TranscriptionResult  # noqa: E402


@pytest.fixture
def mock_speech_backend():
    backend = MagicMock()
    backend.backend_id = "mock"
    backend.health.return_value = True
    backend.transcribe.return_value = TranscriptionResult(
        text="Hello world",
        language="en",
        confidence=0.95,
        duration_seconds=1.5,
        segments=[],
    )
    return backend


@pytest.fixture
def app_with_speech(mock_speech_backend):
    from fastapi import FastAPI

    from openjarvis.server.api_routes import speech_router

    app = FastAPI()
    app.state.speech_backend = mock_speech_backend
    app.state.config = SimpleNamespace(
        speech=SimpleNamespace(
            language="",
            model="base",
            device="auto",
            compute_type="int8",
        )
    )
    app.include_router(speech_router)
    return app


@pytest.fixture
def client(app_with_speech):
    return TestClient(app_with_speech)


def test_transcribe_endpoint(client, mock_speech_backend):
    response = client.post(
        "/v1/speech/transcribe",
        files={"file": ("test.wav", b"fake audio data", "audio/wav")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "Hello world"
    assert data["language"] == "en"
    assert data["confidence"] == 0.95
    assert data["duration_seconds"] == 1.5
    mock_speech_backend.transcribe.assert_called_once_with(
        b"fake audio data",
        format="wav",
        language=None,
    )


def test_transcribe_uses_configured_language(mock_speech_backend):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from openjarvis.server.api_routes import speech_router

    app = FastAPI()
    app.state.speech_backend = mock_speech_backend
    app.state.config = SimpleNamespace(
        speech=SimpleNamespace(
            language="pt",
            model="large-v3-turbo",
            device="auto",
            compute_type="int8",
        )
    )
    app.include_router(speech_router)
    client = TestClient(app)

    response = client.post(
        "/v1/speech/transcribe",
        files={"file": ("test.wav", b"fake audio data", "audio/wav")},
    )

    assert response.status_code == 200
    mock_speech_backend.transcribe.assert_called_once_with(
        b"fake audio data",
        format="wav",
        language="pt",
    )


def test_transcribe_treats_auto_language_as_detection(mock_speech_backend):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from openjarvis.server.api_routes import speech_router

    app = FastAPI()
    app.state.speech_backend = mock_speech_backend
    app.state.config = SimpleNamespace(
        speech=SimpleNamespace(
            language="auto",
            model="large-v3-turbo",
            device="auto",
            compute_type="int8",
        )
    )
    app.include_router(speech_router)
    client = TestClient(app)

    response = client.post(
        "/v1/speech/transcribe",
        files={"file": ("test.wav", b"fake audio data", "audio/wav")},
    )

    assert response.status_code == 200
    mock_speech_backend.transcribe.assert_called_once_with(
        b"fake audio data",
        format="wav",
        language=None,
    )


def test_transcribe_no_file(client):
    response = client.post("/v1/speech/transcribe")
    assert response.status_code == 400 or response.status_code == 422


def test_health_endpoint(client):
    response = client.get("/v1/speech/health")
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["backend"] == "mock"
    assert data["model"] == "base"
    assert data["language"] == ""


def test_health_no_backend():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from openjarvis.server.api_routes import speech_router

    app = FastAPI()
    app.state.speech_backend = None
    app.include_router(speech_router)
    client = TestClient(app)

    response = client.get("/v1/speech/health")
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is False
