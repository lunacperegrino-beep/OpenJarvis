"""Tests for Apple Notes text extraction helpers."""

from __future__ import annotations

from openjarvis.connectors.apple_notes import _html_to_text


def test_html_to_text_strips_embedded_image_data() -> None:
    html = (
        '<div><h1>Plan</h1></div>'
        '<div><img src="data:image/png;base64,AAAA"></div>'
        "<div>Buy milk &amp; call doctor</div>"
    )

    text = _html_to_text(html)

    assert "Plan" in text
    assert "Buy milk & call doctor" in text
    assert "base64" not in text
