"""
Upload route handlers for project-scoped photo storage.
"""

import os
import io
from typing import Optional, List, Tuple
from uuid import UUID

from flask import jsonify, request
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename
from PIL import Image, ImageFile

from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client

ImageFile.LOAD_TRUNCATED_IMAGES = True

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def registerUploadRoutes(blueprint):
    """
    Attach upload-related endpoints to the provided blueprint.
    """

    @blueprint.route("/api/photos/upload", methods=["POST"])
    def uploadPhoto():
        """
        Upload a photo to R2 using the canonical projects/{project_id}/photos/{photo_id}.{ext} key.
        """

        fileItem = request.files.get("file")
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

        contentLength = request.content_length or 0
        if contentLength and contentLength > MAX_UPLOAD_BYTES:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "File too large (max 20MB)",
                    }
                ),
                413,
            )

        projectIdRaw = (request.form.get("project_id") or "").strip()
        try:
            projectId = _validateProjectId(projectIdRaw)
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 400

        userId = request.form.get("user_id")
        caption = request.form.get("caption")
        timestamp = request.form.get("timestamp")
        latitudeRaw = request.form.get("latitude")
        longitudeRaw = request.form.get("longitude")

        if latitudeRaw is None or longitudeRaw is None:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "latitude and longitude are required",
                    }
                ),
                400,
            )

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

        safeName = secure_filename(fileItem.filename or "") or "uploaded_file"

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

        fileSize = len(originalBytes)

        # Step 1: create placeholder record without r2_path so we can obtain photo_id
        metadataPayload = {
            "project_id": projectId,
            "user_id": userId,
            "file_name": safeName,
            "file_type": mimeType or None,
            "file_size": fileSize,
            "latitude": latitudeValue,
            "longitude": longitudeValue,
            "caption": caption or None,
        }
        if timestamp:
            metadataPayload["captured_at"] = timestamp

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

        extension = _extractExtension(safeName, mimeType)
        r2Key = f"projects/{projectId}/photos/{photoId}.{extension}"
        uploaded_keys: list[str] = []

        try:
            uploadSuccess = r2_client.upload_file(
                io.BytesIO(originalBytes), r2Key, content_type=mimeType or None
            )
        except Exception as exc:
            _cleanupSupabasePlaceholder(photoId)
            return (
                jsonify({"status": "error", "message": f"Upload failed: {exc}"}),
                500,
            )

        if not uploadSuccess:
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

        thumbnailKey = f"projects/{projectId}/photos/{photoId}_thumb.{thumbExt}"
        try:
            thumbUpload = r2_client.upload_bytes(
                thumbBytes, thumbnailKey, content_type=thumbMime
            )
        except Exception as exc:
            _cleanupR2Objects(uploaded_keys)
            _cleanupSupabasePlaceholder(photoId)
            return (
                jsonify(
                    {"status": "error", "message": f"Thumbnail upload failed: {exc}"}
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

        try:
            updatedRecord = supabase_client.update_photo_metadata(photoId, updatePayload)
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

        if not updatedRecord:
            _cleanupR2Objects(uploaded_keys)
            _cleanupSupabasePlaceholder(photoId)
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Could not update Supabase record with storage info",
                    }
                ),
                502,
            )

        supabase_client.update_thumbnail_column_hint(updatedRecord)

        return (
            jsonify(
                {
                    "status": "success",
                    "photo_id": photoId,
                    "url": fileUrl,
                    "r2_path": r2Key,
                    "thumbnail_url": thumbnailUrl,
                    "thumbnail_r2_path": thumbnailKey,
                }
            ),
            201,
        )


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

