from flask import Blueprint, request, jsonify
import os
from datetime import datetime, timezone
from app.middleware.auth_middleware import jwt_required
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client
from app.models import Photo
from app.services.photo_service import PhotoService
from app.utils.validators import validate_photo_data
from app import db
from typing import Dict, Any

bp = Blueprint("photos_v1", __name__)
photo_service = PhotoService()


@bp.route("/", methods=["GET"])
@jwt_required
def get_photos():
    """Get all photos with optional filtering - API v1.

    Returns a union of:
    - Supabase-stored photos (if Supabase client is configured)
    - Local SQLite photos saved by PhotoService (with absolute URLs to /uploads)
    """
    try:
        # Parse query parameters
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)
        since = request.args.get("since", type=str)
        bbox = request.args.get("bbox", type=str)
        user_id = request.args.get("user_id", type=str)

        # Enforce max limit
        if limit > 200:
            limit = 200

        processed_photos = []
        total = 0

        # Query Supabase first if available
        if supabase_client.client:
            result = supabase_client.get_photos(
                limit=limit, offset=offset, since=since, bbox=bbox, user_id=user_id
            )
            photos = result.get("data", []) or []
            total += result.get("count", 0) or 0
            for photo in photos:
                processed_photos.append(_process_photo_urls(photo))

        # Also append local DB photos for dev/local uploads
        local_photos = Photo.query.all()
        for p in local_photos:
            # Build absolute URL pointing to /uploads route
            file_path = (p.file_path or "").lstrip("/")
            url = f"{request.host_url.rstrip('/')}/{file_path}"
            processed_photos.append(
                {
                    "id": p.id,
                    "user_id": p.user_id,
                    "latitude": p.latitude,
                    "longitude": p.longitude,
                    "url": url,
                    "taken_at": None,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                    "r2_key": None,
                }
            )
        total += len(local_photos or [])

        # Include any raw files in uploads/ not present in the DB, with sensible defaults
        try:
            uploads_root = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "..", "..", "uploads"
            )
            uploads_root = os.path.normpath(uploads_root)
            existing_paths = set()
            # Track paths from local DB entries to avoid duplicates
            for item in processed_photos:
                path = (item.get("url") or "").replace(
                    request.host_url.rstrip("/") + "/", ""
                )
                if path:
                    existing_paths.add(path)

            default_lat = 40.4676
            default_lng = -79.9606
            default_iso = datetime(
                2025, 10, 11, 18, 30, 0, tzinfo=timezone.utc
            ).isoformat()
            image_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

            if os.path.isdir(uploads_root):
                for root_dir, _, files in os.walk(uploads_root):
                    for name in files:
                        lower = name.lower()
                        # Skip non-images and readmes
                        if not any(lower.endswith(ext) for ext in image_exts):
                            continue
                        if lower.endswith(".md") or lower.endswith(".txt"):
                            continue

                        full_path = os.path.join(root_dir, name)
                        rel_path = os.path.relpath(full_path, uploads_root).replace(
                            os.sep, "/"
                        )
                        rel_with_prefix = f"uploads/{rel_path}"

                        if rel_with_prefix in existing_paths:
                            continue

                        url = f"{request.host_url.rstrip('/')}/{rel_with_prefix}"
                        processed_photos.append(
                            {
                                "id": f"raw-{rel_with_prefix}",
                                "user_id": None,
                                "latitude": default_lat,
                                "longitude": default_lng,
                                "url": url,
                                "taken_at": default_iso,
                                "created_at": default_iso,
                                "r2_key": None,
                            }
                        )
                # total should count these additional raw files as well
                # Note: total remains a hint; we set to length of processed for simplicity
                total = len(processed_photos)
        except Exception:
            # Non-fatal: if directory listing fails, we still return DB/Supabase items
            pass

        return jsonify(
            {
                "photos": processed_photos,
                "pagination": {"limit": limit, "offset": offset, "total": total},
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _process_photo_urls(photo: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process photo to ensure it has a valid URL.
    Prefer explicit 'url' field; fallback to generating presigned URL from 'r2_key'.

    Args:
        photo (Dict[str, Any]): Photo data from Supabase

    Returns:
        Dict[str, Any]: Photo with valid URL
    """
    # Prefer generating a fresh URL from r2_key to avoid stale/unreachable URLs
    r2_key = photo.get("r2_key")
    prefer_public = os.getenv("PREFER_PUBLIC_URLS", "true").lower() == "true"
    if r2_key:
        url = None
        if prefer_public and getattr(r2_client, "public_url", None):
            url = r2_client.get_public_url(r2_key)
        if not url:
            url = r2_client.generate_presigned_url(r2_key, expires_in=600)
        if url:
            photo["url"] = url
            return photo

    # Fallback: keep existing url if present
    if photo.get("url") and photo["url"].strip():
        return photo

    return photo


@bp.route("/<photo_id>", methods=["GET"])
@jwt_required
def get_photo(photo_id):
    """Get a specific photo by ID - API v1"""
    try:
        photo = Photo.query.get_or_404(photo_id)
        return jsonify({"version": "v1", "photo": photo.to_dict()})
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500


@bp.route("/location", methods=["GET"])
@jwt_required
def get_photos_by_location():
    """Get photos by location coordinates - API v1"""
    try:
        lat = request.args.get("lat", type=float)
        lng = request.args.get("lng", type=float)
        radius = request.args.get("radius", 0.001, type=float)

        if not lat or not lng:
            return (
                jsonify(
                    {"error": "Latitude and longitude are required", "version": "v1"}
                ),
                400,
            )

        photos = photo_service.get_photos_by_location(lat, lng, radius)
        return jsonify(
            {"version": "v1", "photos": [photo.to_dict() for photo in photos]}
        )
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500


@bp.route("/upload", methods=["POST"])
@jwt_required
def upload_photo():
    """Upload a new photo - API v1"""
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided", "version": "v1"}), 400

        file = request.files["file"]
        caption = request.form.get("caption", "")
        latitude = request.form.get("latitude", type=float)
        longitude = request.form.get("longitude", type=float)

        if not latitude or not longitude:
            return (
                jsonify(
                    {"error": "Latitude and longitude are required", "version": "v1"}
                ),
                400,
            )

        # Validate photo data
        validation_result = validate_photo_data(file, latitude, longitude)
        if not validation_result["valid"]:
            return jsonify({"error": validation_result["error"], "version": "v1"}), 400

        # Process and save photo
        photo_data = photo_service.process_upload(
            file=file, caption=caption, latitude=latitude, longitude=longitude
        )

        return jsonify({"version": "v1", "photo": photo_data.to_dict()}), 201
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500


@bp.route("/<photo_id>", methods=["PUT"])
@jwt_required
def update_photo(photo_id):
    """Update a photo - API v1"""
    try:
        photo = Photo.query.get_or_404(photo_id)
        data = request.get_json()

        if "caption" in data:
            photo.caption = data["caption"]

        db.session.commit()
        return jsonify({"version": "v1", "photo": photo.to_dict()})
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500


@bp.route("/<photo_id>", methods=["DELETE"])
@jwt_required
def delete_photo(photo_id):
    """Delete a photo - API v1"""
    try:
        photo = Photo.query.get_or_404(photo_id)

        # Delete file from storage
        photo_service.delete_photo_file(photo.file_path)
        if photo.thumbnail_path:
            photo_service.delete_photo_file(photo.thumbnail_path)

        # Delete from database
        db.session.delete(photo)
        db.session.commit()

        return jsonify({"message": "Photo deleted successfully", "version": "v1"})
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500


@bp.route("/stats", methods=["GET"])
@jwt_required
def get_photo_stats():
    """Get photo statistics - API v1"""
    try:
        stats = photo_service.get_photo_stats()
        return jsonify({"version": "v1", "stats": stats})
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500
