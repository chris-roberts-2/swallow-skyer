"""
Rasterization utility for project plan uploads.
Converts PDF (first page) or image (PNG/JPEG) into a PNG buffer suitable for MapLibre overlays.
"""

import io
from typing import Tuple

from PIL import Image

# Target DPI equivalent for PDF first page (high resolution for zoom clarity)
PDF_RENDER_DPI = 300


class RasterizeError(Exception):
    """Raised when rasterization fails (unsupported format, corrupted file, etc.)."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _pdf_to_png(data: bytes) -> Tuple[bytes, int, int]:
    """
    Render the first page of a PDF to PNG at high resolution.
    Returns (png_bytes, width, height).
    """
    try:
        import fitz
    except ImportError:
        raise RasterizeError("PDF support requires PyMuPDF (pip install pymupdf)")

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        raise RasterizeError(f"Invalid or corrupted PDF: {e}") from e

    try:
        if len(doc) == 0:
            raise RasterizeError("PDF has no pages")
        page = doc[0]
        # ~300 DPI for clarity during zoom
        mat = fitz.Matrix(PDF_RENDER_DPI / 72.0, PDF_RENDER_DPI / 72.0)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        width = pix.width
        height = pix.height
        # Convert to PNG via PIL (Pixmap.samples is raw RGB bytes)
        img = Image.frombytes("RGB", (width, height), pix.samples)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), width, height
    finally:
        doc.close()


def _image_to_png(data: bytes, format_hint: str) -> Tuple[bytes, int, int]:
    """
    Open an image (PNG or JPEG), validate, and return as PNG buffer with dimensions.
    """
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:
        raise RasterizeError(f"Invalid or corrupted image: {e}") from e

    # Normalize to RGB or RGBA for consistent PNG
    if img.mode in ("RGB", "RGBA"):
        out = img
    elif img.mode in ("P", "L", "LA"):
        out = img.convert("RGBA") if "A" in img.mode else img.convert("RGB")
    else:
        out = img.convert("RGB")

    width, height = out.size
    if width <= 0 or height <= 0:
        raise RasterizeError("Image has invalid dimensions")

    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), width, height


def rasterize_to_png(
    data: bytes,
    filename_hint: str = "",
    mime_hint: str = "",
) -> Tuple[bytes, int, int]:
    """
    Convert an uploaded plan file to a PNG image buffer and return pixel dimensions.

    Supports:
    - PDF: first page rendered at ~300 DPI
    - PNG / JPEG: validated and normalized to PNG

    Returns:
        (png_bytes, width, height)

    Raises:
        RasterizeError: Unsupported format, corrupted file, or conversion failure.
    """
    if not data:
        raise RasterizeError("No file data provided")

    # Detect format from filename and/or mime
    ext = ""
    if filename_hint:
        parts = filename_hint.rsplit(".", 1)
        if len(parts) == 2:
            ext = parts[1].lower().strip()
    if not ext and mime_hint:
        m = (mime_hint or "").lower()
        if "pdf" in m:
            ext = "pdf"
        elif "png" in m:
            ext = "png"
        elif "jpeg" in m or "jpg" in m:
            ext = "jpg"

    if ext == "pdf":
        return _pdf_to_png(data)
    if ext in ("png", "jpg", "jpeg"):
        return _image_to_png(data, ext)

    # Sniff by magic bytes if hint missing
    if data[:4] == b"%PDF":
        return _pdf_to_png(data)
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return _image_to_png(data, "png")
    if data[:2] in (b"\xff\xd8", b"\xFF\xD8"):
        return _image_to_png(data, "jpeg")

    raise RasterizeError("Unsupported format. Use PDF, PNG, or JPEG.")
