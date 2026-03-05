"""Unit tests for plan rasterization (PNG/JPEG validation and conversion)."""

import io

import pytest
from PIL import Image

from app.services.plan_rasterizer import (
    RasterizeError,
    rasterize_to_png,
)


def _make_png_bytes(width=10, height=20):
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(128, 128, 128))
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_jpeg_bytes(width=15, height=25):
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(64, 64, 64))
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_rasterize_png_returns_png_and_dimensions():
    """PNG input is validated and returned as PNG with correct dimensions."""
    png = _make_png_bytes(10, 20)
    out, w, h = rasterize_to_png(png, filename_hint="plan.png", mime_hint="image/png")
    assert w == 10
    assert h == 20
    assert out[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(out) > 0


def test_rasterize_jpeg_returns_png_and_dimensions():
    """JPEG input is normalized to PNG with correct dimensions."""
    jpeg = _make_jpeg_bytes(15, 25)
    out, w, h = rasterize_to_png(jpeg, filename_hint="plan.jpg", mime_hint="image/jpeg")
    assert w == 15
    assert h == 25
    assert out[:8] == b"\x89PNG\r\n\x1a\n"


def test_rasterize_png_by_magic_without_filename():
    """PNG can be detected by magic bytes when filename hint is missing."""
    png = _make_png_bytes(7, 11)
    out, w, h = rasterize_to_png(png, filename_hint="", mime_hint="")
    assert w == 7
    assert h == 11
    assert out[:8] == b"\x89PNG\r\n\x1a\n"


def test_rasterize_jpeg_by_magic_without_filename():
    """JPEG can be detected by magic bytes when filename hint is missing."""
    jpeg = _make_jpeg_bytes(3, 5)
    out, w, h = rasterize_to_png(jpeg, filename_hint="", mime_hint="application/octet-stream")
    assert w == 3
    assert h == 5
    assert out[:8] == b"\x89PNG\r\n\x1a\n"


def test_rasterize_empty_data_raises():
    """Empty data raises RasterizeError."""
    with pytest.raises(RasterizeError) as exc_info:
        rasterize_to_png(b"", filename_hint="plan.png")
    assert "No file data" in exc_info.value.message


def test_rasterize_corrupt_data_raises():
    """Corrupt image data raises RasterizeError."""
    with pytest.raises(RasterizeError) as exc_info:
        rasterize_to_png(b"not a valid image", filename_hint="plan.png")
    assert "Invalid" in exc_info.value.message or "corrupted" in exc_info.value.message.lower()


def test_rasterize_unsupported_format_raises():
    """Unsupported format (no magic, wrong extension) raises RasterizeError."""
    with pytest.raises(RasterizeError) as exc_info:
        rasterize_to_png(b"xxxxxx", filename_hint="plan.gif")
    assert "Unsupported" in exc_info.value.message


def test_rasterize_pdf_invalid_raises():
    """Invalid PDF input raises RasterizeError (corrupt PDF or missing PyMuPDF)."""
    with pytest.raises(RasterizeError) as exc_info:
        rasterize_to_png(b"%PDF-1.4 invalid", filename_hint="plan.pdf")
    msg = exc_info.value.message
    assert "PDF" in msg or "Invalid" in msg or "corrupted" in msg.lower()
