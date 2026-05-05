"""Image generation tool — Draw Things (local) or OpenAI DALL-E."""

from __future__ import annotations

import base64
import os
import time
from pathlib import Path
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_VALID_SIZES = {"256x256", "512x512", "1024x1024"}

# Draw Things size → (width, height)
_DT_SIZES = {
    "256x256": (256, 256),
    "512x512": (512, 512),
    "1024x1024": (1024, 1024),
}

_DRAWTHINGS_URL = os.environ.get("DRAWTHINGS_API_URL", "http://localhost:7860")


def _apply_drawthings_options(options: dict) -> None:
    """POST option overrides to DrawThings before generation."""
    try:
        import httpx
        httpx.post(
            f"{_DRAWTHINGS_URL}/sdapi/v1/options",
            json=options,
            timeout=30.0,
        )
    except Exception:
        pass


def _generate_drawthings(
    prompt: str,
    size: str,
    output_path: str | None,
    *,
    negative_prompt: str | None = None,
    steps: int | None = None,
    sampler: str | None = None,
    model: str | None = None,
    lora: str | None = None,
    lora_weight: float = 1.0,
) -> ToolResult:
    """Call the Draw Things local API to generate an image."""
    try:
        import httpx
    except ImportError:
        return ToolResult(
            tool_name="image_generate",
            content="httpx not installed. Run: pip install httpx",
            success=False,
        )

    # Apply model/lora/sampler via options API before generating
    options_patch: dict = {}
    if model:
        options_patch["model"] = model
    if lora:
        options_patch["loras"] = [{"file": lora, "mode": "all", "weight": lora_weight}]
    elif lora is None and model:
        # Switching model — clear any active LoRAs to avoid cross-model conflicts
        pass
    if sampler:
        options_patch["sampler"] = sampler
    if options_patch:
        _apply_drawthings_options(options_patch)

    w, h = _DT_SIZES.get(size, (512, 512))
    payload: dict = {
        "prompt": prompt,
        "width": w,
        "height": h,
        "steps": steps if steps is not None else 20,
    }
    if negative_prompt:
        payload["negative_prompt"] = negative_prompt

    try:
        resp = httpx.post(
            f"{_DRAWTHINGS_URL}/sdapi/v1/txt2img",
            json=payload,
            timeout=300.0,
        )
        resp.raise_for_status()
    except httpx.ConnectError:
        return ToolResult(
            tool_name="image_generate",
            content=(
                "Draw Things API not reachable at http://localhost:7860. "
                "Open Draw Things → Settings → API Server → Enable."
            ),
            success=False,
        )
    except Exception as exc:
        return ToolResult(
            tool_name="image_generate",
            content=f"Draw Things error: {exc}",
            success=False,
        )

    data = resp.json()
    images = data.get("images", [])
    if not images:
        return ToolResult(
            tool_name="image_generate",
            content="Draw Things returned no images.",
            success=False,
        )

    img_bytes = base64.b64decode(images[0])

    if not output_path:
        save_dir = Path.home() / "Pictures" / "jarvis"
        save_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(save_dir / f"image_{int(time.time())}.png")

    Path(output_path).write_bytes(img_bytes)

    return ToolResult(
        tool_name="image_generate",
        content=f"Image saved to {output_path}",
        success=True,
        metadata={"path": output_path, "size": size, "provider": "drawthings"},
    )


def _generate_openai(prompt: str, size: str, output_path: str | None) -> ToolResult:
    """Call OpenAI DALL-E 3 to generate an image."""
    try:
        import openai
    except ImportError:
        return ToolResult(
            tool_name="image_generate",
            content="openai package not installed.",
            success=False,
        )

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return ToolResult(
            tool_name="image_generate",
            content="No API key configured. Set OPENAI_API_KEY.",
            success=False,
        )

    try:
        client = openai.OpenAI()
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size=size,
            n=1,
        )
        url = response.data[0].url
    except Exception as exc:
        return ToolResult(
            tool_name="image_generate",
            content=f"Image generation error: {exc}",
            success=False,
        )

    if output_path:
        try:
            import httpx

            img_bytes = httpx.get(url, follow_redirects=True, timeout=60.0).content
            Path(output_path).write_bytes(img_bytes)
        except Exception as exc:
            return ToolResult(
                tool_name="image_generate",
                content=f"Generated but failed to save: {exc}. URL: {url}",
                success=False,
                metadata={"url": url},
            )

    return ToolResult(
        tool_name="image_generate",
        content=url,
        success=True,
        metadata={"url": url, "size": size, "provider": "openai"},
    )


@ToolRegistry.register("image_generate")
class ImageGenerateTool(BaseTool):
    """Generate images locally via Draw Things or via OpenAI DALL-E."""

    tool_id = "image_generate"
    is_local = True  # Draw Things is the default - fully local

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="image_generate",
            description=(
                "Generate an image from a text description using Draw Things "
                "(local) or OpenAI DALL-E. Supports model selection, LoRA, "
                "sampler, negative prompt, and step count. "
                "Returns the file path where the image was saved."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Text description of the image to generate.",
                    },
                    "size": {
                        "type": "string",
                        "description": (
                            "Image size: '256x256', '512x512', or '1024x1024'. "
                            "Default '512x512'."
                        ),
                    },
                    "negative_prompt": {
                        "type": "string",
                        "description": (
                            "Things to exclude from the image "
                            "(e.g. 'blurry, watermark, text')."
                        ),
                    },
                    "steps": {
                        "type": "integer",
                        "description": (
                            "Number of diffusion steps. Higher = more detail "
                            "but slower. Default 20."
                        ),
                    },
                    "sampler": {
                        "type": "string",
                        "description": (
                            "Sampling algorithm "
                            "(e.g. 'UniPC Trailing', 'DPM++ 2M', 'Euler a')."
                        ),
                    },
                    "model": {
                        "type": "string",
                        "description": (
                            "Draw Things model filename to use "
                            "(e.g. 'sd_xl_base_1.0.safetensors'). Switches "
                            "the active model - takes extra time to load."
                        ),
                    },
                    "lora": {
                        "type": "string",
                        "description": (
                            "LoRA filename to apply "
                            "(e.g. 'my_style_lora.safetensors'). Leave empty "
                            "to use no LoRA."
                        ),
                    },
                    "lora_weight": {
                        "type": "number",
                        "description": (
                            "Strength of the LoRA effect, 0.0-2.0. Default 1.0."
                        ),
                    },
                    "output_path": {
                        "type": "string",
                        "description": (
                            "File path to save the image. Default: "
                            "~/Pictures/jarvis/image_<timestamp>.png"
                        ),
                    },
                    "provider": {
                        "type": "string",
                        "description": (
                            "Provider: 'drawthings' (local, default) or "
                            "'openai' (needs API key)."
                        ),
                    },
                },
                "required": ["prompt"],
            },
            category="media",
            required_capabilities=[],
            timeout_seconds=300.0,
        )

    def execute(self, **params: Any) -> ToolResult:
        prompt = params.get("prompt", "")
        if not prompt:
            return ToolResult(
                tool_name="image_generate",
                content="No prompt provided.",
                success=False,
            )

        size = params.get("size", "512x512")
        if size not in _VALID_SIZES:
            return ToolResult(
                tool_name="image_generate",
                content=(
                    f"Invalid size '{size}'. "
                    f"Must be one of: {', '.join(sorted(_VALID_SIZES))}."
                ),
                success=False,
            )

        provider = params.get("provider", "drawthings")
        output_path = params.get("output_path")

        if provider == "openai":
            return _generate_openai(prompt, size, output_path)
        if provider == "drawthings":
            return _generate_drawthings(
                prompt,
                size,
                output_path,
                negative_prompt=params.get("negative_prompt") or None,
                steps=params.get("steps") or None,
                sampler=params.get("sampler") or None,
                model=params.get("model") or None,
                lora=params.get("lora") or None,
                lora_weight=float(params.get("lora_weight", 1.0)),
            )
        return ToolResult(
            tool_name="image_generate",
            content=(
                f"Unsupported provider '{provider}'. "
                "Must be 'drawthings' or 'openai'."
            ),
            success=False,
        )


__all__ = ["ImageGenerateTool"]
