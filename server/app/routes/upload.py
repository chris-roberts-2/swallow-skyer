"""
Upload route handlers for project-scoped photo storage.
"""

import os
import io
from typing import Optional, List, Tuple
from uuid import UUID

from flask import jsonify, request, g
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename
from PIL import Image, ImageFile
from PIL.ExifTags import TAGS, GPSTAGS
from datetime import datetime, timezone

from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client
from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role

ALLOWED_UPLOAD_ROLES = {"Owner", "Administrator", "Editor"}

ImageFile.LOAD_TRUNCATED_IMAGES = True

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def registerUploadRoutes(blueprint):
    """
    Attach upload-related endpoints to the provided blueprint.
    """

    @blueprint.route("/api/photos/upload", methods=["POST"])
    @jwt_required
    def uploadPhoto():
        """
        Upload one or many photos to R2 using the canonical projects/{project_id}/photos/{photo_id}.{ext} key.
        """

        files = request.files.getlist("files")
        # backward compatibility: support single "file"
        if not files:
            single = request.files.get("file")
            files = [single] if single else []

        if not files:
            return (
                jsonify({"status": "error", "message": "Image file is required"}),
                400,
            )

        projectIdRaw = (request.form.get("project_id") or "").strip()
        try:
            projectId = _validateProjectId(projectIdRaw)
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 400
        permission = require_role(projectId, ALLOWED_UPLOAD_ROLES)
        if isinstance(permission, tuple):
            payload, status_code = permission
            return jsonify(payload), status_code

        userId = permission.get("user_id")
        caption = request.form.get("caption")
        timestamp = request.form.get("timestamp")
        latitudeRaw = request.form.get("latitude")
        longitudeRaw = request.form.get("longitude")

        latitudeValue = None
        longitudeValue = None
        if latitudeRaw not in (None, "") and longitudeRaw not in (None, ""):
            try:
                latitudeValue = float(latitudeRaw)
                longitudeValue = float(longitudeRaw)
            except (TypeError, ValueError):
                return (
                    jsonify({"status": "error", "message": "Invalid latitude/longitude"}),
                    400,
                )

        if not r2_client.client:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Storage not configured. Check R2 environment variables.",
                    }
                ),
                500,
            )

        if not supabase_client.client:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Database not configured. Check Supabase environment variables.",
                    }
                ),
                500,
            )

        results = []

        for fileItem in files:
            if not fileItem or not getattr(fileItem, "filename", None):
                return (
                    jsonify({"status": "error", "message": "Image file is required"}),
                    400,
                )

            mimeType = (getattr(fileItem, "mimetype", "") or "").lower()
            if not mimeType.startswith("image/"):
                return (
                    jsonify({"status": "error", "message": "Invalid file type. Image required"}),
                    400,
                )

            try:
                originalBytes = _read_file_bytes(fileItem)
            except ValueError as exc:
                return jsonify({"status": "error", "message": str(exc)}), 400

            if len(originalBytes) > MAX_UPLOAD_BYTES:
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": "File too large (max 20MB)",
                        }
                    ),
                    413,
                )

            try:
                pil_image = _load_image(originalBytes)
            except ValueError as exc:
                return (
                    jsonify({"status": "error", "message": str(exc)}),
                    400,
                )

            safeName = secure_filename(fileItem.filename or "") or "uploaded_file"
            fileSize = len(originalBytes)
            extension = _extractExtension(safeName, mimeType)

            exif_data, captured_at, gps_decimal = _extract_exif_data(
                pil_image, originalBytes
            )

            location_id = None
            if gps_decimal and gps_decimal.get("lat") is not None and gps_decimal.get(
                "lon"
            ) is not None:
                location_id = supabase_client.get_or_create_location(
                    gps_decimal["lat"], gps_decimal["lon"], gps_decimal.get("alt")
                )

            # Step 1: create placeholder record without r2_path so we can obtain photo_id
            metadataPayload = {
                "project_id": projectId,
                "user_id": userId,
                "exif_data": exif_data or None,
                "file_name": safeName,
                "original_filename": fileItem.filename,
                "file_type": mimeType or None,
                "file_size": fileSize,
                "latitude": latitudeValue
                if gps_decimal is None
                else gps_decimal.get("lat", latitudeValue),
                "longitude": longitudeValue
                if gps_decimal is None
                else gps_decimal.get("lon", longitudeValue),
                "location_id": location_id,
                "caption": caption or None,
                "show_on_photos": True,
            }
            if timestamp:
                metadataPayload["captured_at"] = timestamp
            elif captured_at:
                metadataPayload["captured_at"] = captured_at

            # Strip null bytes from all strings to prevent Postgres 22P05 errors
            metadataPayload = _strip_null_bytes(metadataPayload)

            try:
                placeholderRecord = supabase_client.store_photo_metadata(metadataPayload)
            except Exception as exc:
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": f"Failed to create photo record: {exc}",
                        }
                    ),
                    500,
                )

            if not placeholderRecord or not isinstance(placeholderRecord, dict):
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": "Could not persist photo metadata",
                        }
                    ),
                    502,
                )

            photoId = placeholderRecord.get("id")
            if not photoId:
                _cleanupSupabasePlaceholder(placeholderRecord.get("id"))
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": "Supabase did not return a photo id",
                        }
                    ),
                    502,
                )

            uploaded_keys: List[str] = []
            try:
                r2Key = r2_client.upload_project_photo(
                    projectId, photoId, originalBytes, extension, content_type=mimeType
                )
            except Exception as exc:
                _cleanupSupabasePlaceholder(photoId)
                return (
                    jsonify({"status": "error", "message": f"Upload failed: {exc}"}),
                    500,
                )

            if not r2Key:
                _cleanupSupabasePlaceholder(photoId)
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": "Failed to upload to storage",
                        }
                    ),
                    502,
                )
            uploaded_keys.append(r2Key)

            fileUrl = r2_client.get_file_url(r2Key)
            if not fileUrl:
                _cleanupR2Objects(uploaded_keys)
                _cleanupSupabasePlaceholder(photoId)
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": "Failed to generate file URL",
                        }
                    ),
                    500,
                )

            try:
                thumbBytes, thumbExt, thumbMime = _generate_thumbnail_bytes(
                    pil_image, mimeType
                )
            except ValueError as exc:
                _cleanupR2Objects(uploaded_keys)
                _cleanupSupabasePlaceholder(photoId)
                return (
                    jsonify({"status": "error", "message": str(exc)}),
                    500,
                )

            thumbnailKey = (
                f"projects/{projectId}/photos/{photoId}_thumb.{thumbExt}"
            )
            try:
                thumbUpload = r2_client.upload_bytes(
                    thumbBytes, thumbnailKey, content_type=thumbMime
                )
            except Exception as exc:
                _cleanupR2Objects(uploaded_keys)
                _cleanupSupabasePlaceholder(photoId)
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": f"Thumbnail upload failed: {exc}",
                        }
                    ),
                    500,
                )

            if not thumbUpload:
                _cleanupR2Objects(uploaded_keys)
                _cleanupSupabasePlaceholder(photoId)
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": "Failed to upload thumbnail to storage",
                        }
                    ),
                    502,
                )

            uploaded_keys.append(thumbnailKey)

            thumbnailUrl = r2_client.get_file_url(thumbnailKey)
            if not thumbnailUrl:
                _cleanupR2Objects(uploaded_keys)
                _cleanupSupabasePlaceholder(photoId)
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": "Failed to generate thumbnail URL",
                        }
                    ),
                    500,
                )

            updatePayload = {
                "r2_path": r2Key,
                "r2_url": fileUrl,
                "r2_key": r2Key,
                "url": fileUrl,
            }
            thumbnail_updates = supabase_client.build_thumbnail_updates(
                thumbnail_path=thumbnailKey,
                thumbnail_url=thumbnailUrl,
                record_hint=placeholderRecord,
            )
            updatePayload.update(thumbnail_updates)
            
            # Strip null bytes from update payload as well
            updatePayload = _strip_null_bytes(updatePayload)

            try:
                updatedRecord = supabase_client.update_photo_metadata(
                    photoId, updatePayload
                )
            except Exception as exc:
                _cleanupR2Objects(uploaded_keys)
                _cleanupSupabasePlaceholder(photoId)
                return (
                    jsonify(
                        {
                            "status": "error",
                            "message": f"Failed to update photo record: {exc}",
                        }
                    ),
                    500,
                )

            # Even if updatedRecord is None (e.g., Supabase returned no data), proceed;
            # update_photo_metadata now returns a synthesized record on non-fatal errors.

            supabase_client.update_thumbnail_column_hint(updatedRecord)
            results.append(
                {
                    "photo_id": photoId,
                    "r2_url": fileUrl,
                    "r2_path": r2Key,
                    "thumbnail_r2_path": thumbnailKey,
                    "thumbnail_r2_url": thumbnailUrl,
                    "original_filename": fileItem.filename,
                }
            )

        return jsonify({"status": "success", "uploaded": results}), 201


def _validateProjectId(projectId: str) -> str:
    if not projectId:
        raise ValueError("project_id is required")
    try:
        return str(UUID(projectId))
    except ValueError as exc:
        raise ValueError("project_id must be a valid UUID") from exc


def _extractExtension(filename: str, mimeType: str) -> str:
    _, ext = os.path.splitext(filename)
    cleaned = ext.lstrip(".").lower()
    if not cleaned and mimeType:
        cleaned = (mimeType.split("/")[-1] if "/" in mimeType else mimeType).lower()
    cleaned = "".join(ch for ch in cleaned if ch.isalnum())
    return cleaned or "bin"


def _cleanupSupabasePlaceholder(photoId: Optional[str]) -> None:
    if not photoId:
        return
    try:
        supabase_client.delete_photo_metadata(photoId)
    except Exception:
        pass


def _cleanupR2Object(r2Key: Optional[str]) -> None:
    if not r2Key:
        return
    try:
        r2_client.delete_file(r2Key)
    except Exception:
        pass


def _cleanupR2Objects(keys: List[str]) -> None:
    for key in keys or []:
        _cleanupR2Object(key)


def _read_file_bytes(file_item: FileStorage) -> bytes:
    stream = getattr(file_item, "stream", None)
    if stream and hasattr(stream, "seek"):
        stream.seek(0)
        data = stream.read()
    else:
        data = file_item.read()
    if not data:
        raise ValueError("Uploaded file is empty")
    return data


def _load_image(data: bytes) -> Image.Image:
    try:
        buffer = io.BytesIO(data)
        image = Image.open(buffer)
        image.load()
        return image
    except Exception as exc:
        raise ValueError("Unable to decode image") from exc


def _has_transparency(image: Image.Image) -> bool:
    if image.mode in ("RGBA", "LA"):
        return True
    if image.mode == "P":
        return "transparency" in image.info
    bands = image.getbands()
    return "A" in bands if bands else False


def _generate_thumbnail_bytes(
    image: Image.Image, mime_type: str
) -> Tuple[bytes, str, str]:
    thumb = image.copy()
    thumb.thumbnail((512, 512), Image.Resampling.LANCZOS)

    use_png = mime_type == "image/png" and _has_transparency(image)
    target_format = "PNG" if use_png else "JPEG"

    buffer = io.BytesIO()
    if target_format == "JPEG":
        if thumb.mode not in ("RGB", "L"):
            thumb = thumb.convert("RGB")
        thumb.save(buffer, format=target_format, quality=85, optimize=True)
    else:
        if thumb.mode not in ("RGBA", "LA"):
            thumb = thumb.convert("RGBA")
        thumb.save(buffer, format=target_format, optimize=True)

    if target_format == "JPEG":
        extension = "jpg"
    else:
        extension = target_format.lower()
    content_type = f"image/{'jpeg' if target_format == 'JPEG' else extension}"
    return buffer.getvalue(), extension, content_type


def _rational_to_float(value):
    try:
        if isinstance(value, (int, float)):
            return float(value)
        # Pillow may already have converted rationals into tuples/lists or floats.
        # Handle common shapes: (num, denom) or [num, denom].
        if isinstance(value, (list, tuple)) and len(value) == 2:
            return float(value[0]) / float(value[1])
        return float(value[0]) / float(value[1])
    except Exception:
        return None


def _dms_to_decimal(dms, ref):
    try:
        # DMS can arrive as:
        # - rationals (num, denom)
        # - floats/ints
        # - already-normalized [deg, min, sec] floats
        degrees = _rational_to_float(dms[0])
        minutes = _rational_to_float(dms[1])
        seconds = _rational_to_float(dms[2])
        if degrees is None or minutes is None or seconds is None:
            return None
        decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
        if ref in ["S", "W"]:
            decimal = -decimal
        return decimal
    except Exception:
        return None


def _extract_exif_data(image: Image.Image, original_bytes: bytes):
    # We intentionally store a minimal, stable EXIF payload in Supabase:
    # - only the canonical GPS decimal coordinates (+ a few optional fields)
    # - avoids huge/non-deterministic fields like MakerNote that may contain null bytes
    exif_data = {}
    gps_decimal = {}
    captured_at = None

    try:
        raw_exif = image._getexif() or {}
    except Exception:
        raw_exif = {}

    def _safe_value(val):
        # Convert EXIF rationals and other non-JSON types to plain floats/strings
        try:
            from fractions import Fraction
        except Exception:
            Fraction = None

        try:
            from PIL.TiffImagePlugin import IFDRational
        except Exception:
            class IFDRational:  # type: ignore
                pass

        if isinstance(val, IFDRational):
            try:
                return float(val)
            except Exception:
                return None
        if Fraction and isinstance(val, Fraction):
            try:
                return float(val)
            except Exception:
                return None
        if isinstance(val, tuple):
            return [_safe_value(v) for v in val]
        if isinstance(val, list):
            return [_safe_value(v) for v in val]
        if isinstance(val, dict):
            return {k: _safe_value(v) for k, v in val.items()}
        return val

    # Extract only what we need from EXIF.
    gps_info = {}
    for tag_id, value in raw_exif.items():
        tag = TAGS.get(tag_id, tag_id)
        if tag == "GPSInfo":
            try:
                for key in value:
                    sub_tag = GPSTAGS.get(key, key)
                    gps_info[sub_tag] = _safe_value(value[key])
            except Exception:
                gps_info = {}
            break

    # Parse datetime_original
    dt_original = None
    if gps_info:
        # Date/time tags are not part of GPSInfo; they are top-level tags.
        # Pull from raw EXIF to avoid persisting huge EXIF payloads.
        pass
    try:
        dt_original = _safe_value(raw_exif.get(36867)) or _safe_value(raw_exif.get(306))
    except Exception:
        dt_original = None
    offset_hint = (
        (_safe_value(raw_exif.get(36881)) if raw_exif else None)
        or (_safe_value(raw_exif.get(36882)) if raw_exif else None)
        or (_safe_value(raw_exif.get(36880)) if raw_exif else None)
    )
    if dt_original:
        try:
            naive_dt = datetime.strptime(dt_original, "%Y:%m:%d %H:%M:%S")
            if offset_hint:
                try:
                    tzinfo = datetime.strptime(offset_hint, "%z").tzinfo
                except Exception:
                    tzinfo = timezone.utc
            else:
                tzinfo = timezone.utc
            captured_at = naive_dt.replace(tzinfo=tzinfo).isoformat()
        except Exception:
            captured_at = None

    # Parse GPS to decimal
    lat = gps_info.get("GPSLatitude")
    lat_ref = gps_info.get("GPSLatitudeRef")
    lon = gps_info.get("GPSLongitude")
    lon_ref = gps_info.get("GPSLongitudeRef")
    alt = gps_info.get("GPSAltitude")
    alt_ref = gps_info.get("GPSAltitudeRef")
    hpe = gps_info.get("GPSHPositioningError")

    if lat and lat_ref and lon and lon_ref:
        lat_decimal = _dms_to_decimal(lat, lat_ref)
        lon_decimal = _dms_to_decimal(lon, lon_ref)
        if lat_decimal is not None and lon_decimal is not None:
            gps_decimal["lat"] = lat_decimal
            gps_decimal["lon"] = lon_decimal
            if alt is not None:
                alt_val = _rational_to_float(alt)
                if alt_val is not None:
                    gps_decimal["alt"] = alt_val * (-1 if alt_ref else 1)
            if hpe is not None:
                # Store horizontal positioning error in meters if we can coerce it.
                try:
                    hpe_val = float(hpe)
                    if hpe_val >= 0:
                        gps_decimal["hpe_m"] = hpe_val
                except Exception:
                    pass

    if not captured_at:
        try:
            captured_at = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            captured_at = None

    # Ensure EXIF is JSON-serializable before sending to Supabase
    if gps_decimal and gps_decimal.get("lat") is not None and gps_decimal.get("lon") is not None:
        exif_data = {
            "gps": {
                "lat": gps_decimal.get("lat"),
                "lon": gps_decimal.get("lon"),
                "alt": gps_decimal.get("alt"),
                "hpe_m": gps_decimal.get("hpe_m"),
            }
        }
    else:
        exif_data = {"gps": {}}
    try:
        exif_data = _sanitize_for_json(exif_data) if exif_data else None
    except Exception:
        exif_data = None

    return exif_data or None, captured_at, gps_decimal or None


def _sanitize_for_json(value):
    """
    Recursively convert EXIF/metadata values to JSON-serializable primitives.
    - bytes -> utf-8 string fallback to hex
    - non-serializable objects -> str()
    """
    import base64

    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", errors="replace")
        except Exception:
            return base64.b64encode(value).decode("ascii")
    if isinstance(value, (list, tuple)):
        return [_sanitize_for_json(v) for v in value]
    if isinstance(value, dict):
        return {k: _sanitize_for_json(v) for k, v in value.items()}
    try:
        return _sanitize_for_json(value.__dict__)
    except Exception:
        return str(value)


def _strip_null_bytes(value):
    """
    Recursively strip null bytes (\x00) from all strings to prevent Postgres 22P05 errors.
    Postgres TEXT columns cannot store null bytes.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value.replace('\x00', '')
    if isinstance(value, bytes):
        return value.replace(b'\x00', b'')
    if isinstance(value, (list, tuple)):
        return [_strip_null_bytes(v) for v in value]
    if isinstance(value, dict):
        return {k: _strip_null_bytes(v) for k, v in value.items()}
    return value

