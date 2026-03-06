"""
Rasterization utility for project plan uploads.
Converts PDF (first page) or image (PNG/JPEG) into a PNG buffer suitable for MapLibre overlays.
"""

import io
import logging
from typing import Tuple

from PIL import Image

logger = logging.getLogger(__name__)

# Target DPI for PDF page-1 rasterization.
# 150 DPI is sufficient for web-map overlays and keeps memory well under 512 MB.
PDF_RENDER_DPI = 150

# Hard cap on the longest pixel edge for any output raster (PDF or image).
# Images beyond this are down-scaled before PNG encoding.
MAX_RASTER_LONG_EDGE = 4096  # pixels

# Absolute ceiling: if the raw raster (before any scaling) would exceed this many
# pixels on the longest edge we reject the upload rather than attempt rasterization.
# This guards against adversarially large PDFs.
MAX_RASTER_LONG_EDGE_HARD = MAX_RASTER_LONG_EDGE * 3  # 12 288 px


class RasterizeError(Exception):
    """Raised when rasterization fails (unsupported format, corrupted file, etc.)."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _cap_scale(width: int, height: int) -> float:
    """Return a scale factor ≤ 1.0 that fits both dimensions within MAX_RASTER_LONG_EDGE."""
    long_edge = max(width, height)
    if long_edge <= MAX_RASTER_LONG_EDGE:
        return 1.0
    return MAX_RASTER_LONG_EDGE / long_edge


def _pdf_to_png(data: bytes) -> Tuple[bytes, int, int]:
    """
    Render the first page of a PDF to PNG.

    DPI is capped so the longest pixel edge never exceeds MAX_RASTER_LONG_EDGE.
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
        rect = page.rect
        page_w_pts = rect.width
        page_h_pts = rect.height

        # Pixel dimensions at the base DPI (before any capping)
        raw_w = int(page_w_pts * PDF_RENDER_DPI / 72.0)
        raw_h = int(page_h_pts * PDF_RENDER_DPI / 72.0)
        raw_mem_mb = (raw_w * raw_h * 3) / (1024 * 1024)

        logger.info(
            "PDF rasterization: page=%.1fpts×%.1fpts dpi=%d "
            "→ raw=%dpx×%dpx est_mem=%.1fMB",
            page_w_pts, page_h_pts, PDF_RENDER_DPI, raw_w, raw_h, raw_mem_mb,
        )

        # Hard reject: the raw image is too enormous even to attempt
        if max(raw_w, raw_h) > MAX_RASTER_LONG_EDGE_HARD:
            raise RasterizeError(
                f"Plan resolution exceeds supported size ({raw_w}×{raw_h}px estimated at "
                f"{PDF_RENDER_DPI} DPI). Please upload a lower-resolution plan."
            )

        # Scale DPI down so the longest edge fits within MAX_RASTER_LONG_EDGE
        scale = _cap_scale(raw_w, raw_h)
        effective_dpi = PDF_RENDER_DPI * scale

        if scale < 1.0:
            logger.info(
                "Downscaling raster: scale=%.3f effective_dpi=%.1f → %dpx×%dpx",
                scale, effective_dpi, int(raw_w * scale), int(raw_h * scale),
            )

        mat = fitz.Matrix(effective_dpi / 72.0, effective_dpi / 72.0)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        width = pix.width
        height = pix.height
        final_mem_mb = (width * height * 3) / (1024 * 1024)

        logger.info(
            "Final raster: %dpx×%dpx est_mem=%.1fMB", width, height, final_mem_mb
        )

        img = Image.frombytes("RGB", (width, height), pix.samples)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), width, height
    finally:
        doc.close()


def _image_to_png(data: bytes, format_hint: str) -> Tuple[bytes, int, int]:
    """
    Open an image (PNG or JPEG), validate, down-scale if needed, and return as PNG buffer.
    """
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:
        raise RasterizeError(f"Invalid or corrupted image: {e}") from e

    # Normalize to RGB or RGBA for consistent PNG output
    if img.mode in ("RGB", "RGBA"):
        out = img
    elif img.mode in ("P", "L", "LA"):
        out = img.convert("RGBA") if "A" in img.mode else img.convert("RGB")
    else:
        out = img.convert("RGB")

    width, height = out.size
    if width <= 0 or height <= 0:
        raise RasterizeError("Image has invalid dimensions")

    scale = _cap_scale(width, height)
    if scale < 1.0:
        new_w = max(1, int(width * scale))
        new_h = max(1, int(height * scale))
        logger.info(
            "Downscaling image from %dpx×%dpx to %dpx×%dpx",
            width, height, new_w, new_h,
        )
        out = out.resize((new_w, new_h), Image.LANCZOS)
        width, height = out.size

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
    - PDF: first page rendered at PDF_RENDER_DPI, longest edge capped at MAX_RASTER_LONG_EDGE
    - PNG / JPEG: validated, normalized, and down-scaled if needed

    Returns:
        (png_bytes, width, height)

    Raises:
        RasterizeError: Unsupported format, corrupted file, oversized raster, or conversion failure.
    """
    if not data:
        raise RasterizeError("No file data provided")

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

    # Sniff by magic bytes if hint is missing
    if data[:4] == b"%PDF":
        return _pdf_to_png(data)
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return _image_to_png(data, "png")
    if data[:2] in (b"\xff\xd8", b"\xFF\xD8"):
        return _image_to_png(data, "jpeg")

    raise RasterizeError("Unsupported format. Use PDF, PNG, or JPEG.")
