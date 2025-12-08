from flask import Blueprint, request, jsonify, g
import os
import math
from datetime import datetime, timezone
from uuid import UUID
from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import (
    DEFAULT_DENIED_MESSAGE,
    require_role,
    ROLE_ORDER,
)
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client
from app.models import Photo
from app.services.photo_service import PhotoService
from app.utils.validators import validate_photo_data
from app import db
from typing import Dict, Any, Optional, Tuple, List, Set

bp = Blueprint("photos_v1", __name__)
photo_service = PhotoService()

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
VIEW_ROLES: Set[str] = set(ROLE_ORDER)
COLLAB_ROLES: Set[str] = {"collaborator", "co-owner", "owner"}
OWNER_ROLES: Set[str] = {"co-owner", "owner"}


def _parse_page_args() -> Tuple[int, int]:
    """Return sanitized (page, page_size)."""
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE

    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    return page, page_size


def _parse_date_range(raw_range: Optional[str]) -> Optional[Tuple[Optional[str], Optional[str]]]:
    if not raw_range:
        return None
    parts = [part.strip() for part in raw_range.split(",")]
    if len(parts) != 2:
        raise ValueError("date_range must be start,end")

    def _normalize(value: str) -> Optional[str]:
        if not value:
            return None
        cleaned = value.replace("Z", "+00:00") if value.endswith("Z") else value
        # Validate ISO-ish format
        try:
            datetime.fromisoformat(cleaned)
        except ValueError as exc:
            raise ValueError("date_range values must be ISO timestamps") from exc
        return value

    start = _normalize(parts[0])
    end = _normalize(parts[1])
    return (start, end)


def _normalize_uuid(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ValueError("project_id must be a valid UUID") from exc


def _prefetch_project_scope(
    user_id: str, requested_project_id: Optional[str]
) -> Tuple[List[str], Dict[str, Dict[str, Any]], Optional[Tuple[dict, int]]]:
    """
    Resolve the list of authorized project ids plus a memoized metadata cache.

    Returns:
        (authorized_ids, project_cache, error_payload)
    """
    project_cache: Dict[str, Dict[str, Any]] = {}

    if requested_project_id:
        permission = require_role(requested_project_id, VIEW_ROLES, user_id=user_id)
        if isinstance(permission, tuple):
            return [], project_cache, permission
        project_cache[requested_project_id] = {"role": permission.get("role")}
        return [requested_project_id], project_cache, None

    memberships = supabase_client.list_projects_for_user(user_id) or []
    allowed_ids = []
    for project in memberships:
        pid = project.get("id")
        if not pid:
            continue
        allowed_ids.append(pid)
        project_cache[pid] = {"role": project.get("role")}

    return allowed_ids, project_cache, None


def _serialize_photo(
    record: Dict[str, Any],
    project_cache: Dict[str, Dict[str, Any]],
    url_cache: Dict[str, Optional[str]],
    location_cache: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Normalize Supabase record into API contract."""
    key = record.get("r2_path") or record.get("r2_key")
    cached_url = url_cache.get(key or "")

    resolved_url = (
        record.get("r2_url")
        or record.get("url")
        or cached_url
        or (r2_client.resolve_url(key) if key else None)
    )
    if key and key not in url_cache:
        url_cache[key] = resolved_url

    thumb_path, thumb_url = supabase_client.extract_thumbnail_fields(record)
    cached_thumb_url = url_cache.get(thumb_path or "")
    resolved_thumb_url = thumb_url or cached_thumb_url
    if thumb_path and not resolved_thumb_url:
        resolved_thumb_url = r2_client.resolve_url(thumb_path)
    if thumb_path and thumb_path not in url_cache:
        url_cache[thumb_path] = resolved_thumb_url

    project_id = record.get("project_id")
    role = project_cache.get(project_id, {}).get("role")

    location_id = record.get("location_id")
    location = {}
    if location_id and location_id not in location_cache:
        try:
            location = supabase_client.get_location(location_id) or {}
        except Exception:
            location = {}
        location_cache[location_id] = location
    elif location_id:
        location = location_cache.get(location_id) or {}

    return {
        "id": record.get("id"),
        "project_id": project_id,
        "project_role": role,
        "user_id": record.get("user_id"),
        "file_name": record.get("file_name"),
        "caption": record.get("caption"),
        "latitude": record.get("latitude"),
        "longitude": record.get("longitude"),
        "location_id": location_id,
        "location_city": location.get("city"),
        "location_state": location.get("state"),
        "location_country": location.get("country"),
        "geocode_data": location.get("geocode_data"),
        "created_at": record.get("created_at"),
        "captured_at": record.get("captured_at"),
        "r2_path": key,
        "r2_url": record.get("r2_url") or resolved_url,
        "url": resolved_url,
        "thumbnail_r2_path": thumb_path,
        "thumbnail_r2_url": thumb_url or resolved_thumb_url,
        "thumbnail_url": resolved_thumb_url,
        "exif_data": record.get("exif_data"),
    }


def _build_photo_listing_payload() -> Tuple[Dict[str, Any], int]:
    if not supabase_client.client:
        return (
            {
                "error": "Supabase client not configured. Check environment variables.",
            },
            500,
        )

    current_user = getattr(g, "current_user", None) or {}
    current_user_id = current_user.get("id")
    if not current_user_id:
        return ({"error": "Authenticated Supabase user context missing"}, 401)

    try:
        project_id = _normalize_uuid(request.args.get("project_id"))
    except ValueError as exc:
        return ({"error": str(exc)}, 400)

    page, page_size = _parse_page_args()

    # Date range (start_date, end_date or legacy date_range)
    try:
        raw_date_range = request.args.get("date_range")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        if raw_date_range:
            date_range = _parse_date_range(raw_date_range)
        else:
            date_range = (start_date, end_date) if (start_date or end_date) else None
    except ValueError as exc:
        return ({"error": str(exc)}, 400)

    # Bounding box
    bbox = None
    try:
        min_lat = request.args.get("min_lat", type=float)
        max_lat = request.args.get("max_lat", type=float)
        min_lon = request.args.get("min_lon", type=float)
        max_lon = request.args.get("max_lon", type=float)
        if None not in (min_lat, max_lat, min_lon, max_lon):
            bbox = (min_lat, max_lat, min_lon, max_lon)
    except ValueError:
        return ({"error": "Invalid bounding box parameters"}, 400)

    city = request.args.get("city")
    state = request.args.get("state")
    country = request.args.get("country")

    authorized_ids, project_cache, permission_error = _prefetch_project_scope(
        current_user_id, project_id
    )
    if permission_error:
        payload, status_code = permission_error
        return (payload, status_code)

    if not authorized_ids:
        pagination = {
            "page": page,
            "page_size": page_size,
            "total": 0,
            "total_pages": 0,
        }
        return ({"photos": [], "pagination": pagination}, 200)

    user_filter = request.args.get("user_id")

    try:
        query_result = supabase_client.fetch_project_photos(
            project_ids=authorized_ids,
            page=page,
            page_size=page_size,
            user_id=user_filter,
            date_range=date_range,
            bbox=bbox,
            city=city,
            state=state,
            country=country,
            include_signed_urls=True,
        )
    except Exception as exc:
        return ({"error": f"Failed to query Supabase: {exc}"}, 500)

    url_cache: Dict[str, Optional[str]] = {}
    location_cache: Dict[str, Dict[str, Any]] = {}
    serialized = [
        _serialize_photo(record, project_cache, url_cache, location_cache)
        for record in query_result.get("data", []) or []
    ]

    total = query_result.get("count", 0) or 0
    pagination = {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if page_size else 0,
    }

    return ({"photos": serialized, "pagination": pagination}, 200)


def handle_photo_listing_request():
    payload, status = _build_photo_listing_payload()
    return jsonify(payload), status


@bp.route("/", methods=["GET"])
@jwt_required
def get_photos():
    """Return paginated, authorized photos for the authenticated user."""
    return handle_photo_listing_request()


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
        if not supabase_client.client:
            return (
                jsonify(
                    {
                        "error": "Supabase client not configured",
                        "version": "v1",
                    }
                ),
                500,
            )

        current_user = getattr(g, "current_user", None) or {}
        current_user_id = current_user.get("id")
        if not current_user_id:
            return (
                jsonify({"error": "forbidden", "message": "Authentication required"}),
                401,
            )

        record = supabase_client.get_photo_metadata(photo_id)
        if not record:
            return jsonify({"error": "Photo not found", "version": "v1"}), 404

        project_id = record.get("project_id")
        if not project_id:
            return (
                jsonify(
                    {
                        "error": "forbidden",
                        "message": "Project is required for this photo",
                    }
                ),
                403,
            )

        permission = require_role(project_id, VIEW_ROLES, user_id=current_user_id)
        if isinstance(permission, tuple):
            payload, status_code = permission
            return jsonify(payload), status_code

        project_cache: Dict[str, Dict[str, Any]] = {
            project_id: {"role": permission.get("role")}
        }

        serialized = _serialize_photo(record, project_cache, {}, {})
        return jsonify({"version": "v1", "photo": serialized})
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
        project_id = request.form.get("project_id")
        permission = require_role(project_id, COLLAB_ROLES)
        if isinstance(permission, tuple):
            payload, status_code = permission
            return jsonify(payload), status_code

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
        current_user = getattr(g, "current_user", None) or {}
        current_user_id = current_user.get("id")
        if not current_user_id:
            return (
                jsonify({"error": "forbidden", "message": "Authentication required"}),
                401,
            )

        record = supabase_client.get_photo_metadata(photo_id)
        if not record:
            return jsonify({"error": "Photo not found", "version": "v1"}), 404

        project_id = record.get("project_id")
        permission = require_role(project_id, OWNER_ROLES, user_id=current_user_id)
        if isinstance(permission, tuple):
            payload, status_code = permission
            return jsonify(payload), status_code

        photo = Photo.query.get_or_404(photo_id)
        data = request.get_json() or {}

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
        current_user = getattr(g, "current_user", None) or {}
        current_user_id = current_user.get("id")
        if not current_user_id:
            return (
                jsonify({"error": "forbidden", "message": "Authentication required"}),
                401,
            )

        record = supabase_client.get_photo_metadata(photo_id)
        if not record:
            return jsonify({"error": "Photo not found", "version": "v1"}), 404

        project_id = record.get("project_id")
        permission = require_role(project_id, OWNER_ROLES, user_id=current_user_id)
        if isinstance(permission, tuple):
            payload, status_code = permission
            return jsonify(payload), status_code

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
