from __future__ import annotations

import asyncio
import json

from openjarvis.agents._stubs import AgentResult
from openjarvis.core.events import EventBus
from openjarvis.core.types import ToolResult
from openjarvis.server.models import ChatCompletionRequest
from openjarvis.server.stream_bridge import AgentStreamBridge


class _FakeStreamChunk:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeEngine:
    def __init__(self) -> None:
        self.stream_full_called = False

    async def stream_full(self, *_args, **_kwargs):
        self.stream_full_called = True
        yield _FakeStreamChunk("I cannot generate images directly.")


class _FakeAgent:
    def __init__(self) -> None:
        self._engine = _FakeEngine()
        self._model = "qwen3"

    def run(self, _input, context=None):
        return AgentResult(
            content="I cannot generate images directly.",
            tool_results=[
                ToolResult(
                    tool_name="image_generate",
                    content="Image saved to /tmp/apple.png",
                    success=True,
                    latency_seconds=0.1,
                    metadata={"path": "/tmp/apple.png", "provider": "drawthings"},
                )
            ],
            metadata={},
        )


def _collect_content(chunks: list[str]) -> str:
    content = ""
    for chunk in chunks:
        for line in chunk.splitlines():
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                continue
            try:
                parsed = json.loads(data)
            except json.JSONDecodeError:
                continue
            choices = parsed.get("choices") or []
            if not choices:
                continue
            content += choices[0]["delta"].get("content") or ""
    return content


def test_stream_bridge_does_not_rerun_model_after_tool_result() -> None:
    async def collect() -> tuple[_FakeAgent, list[str]]:
        agent = _FakeAgent()
        request = ChatCompletionRequest(
            model="qwen3",
            messages=[{"role": "user", "content": "generate an image"}],
            stream=True,
        )
        bridge = AgentStreamBridge(agent, EventBus(), "qwen3", request)

        chunks = []
        async for chunk in bridge.stream():
            chunks.append(chunk)
        return agent, chunks

    agent, chunks = asyncio.run(collect())
    content = _collect_content(chunks)

    assert agent._engine.stream_full_called is False
    assert content == "Generated the image and saved it to /tmp/apple.png."
