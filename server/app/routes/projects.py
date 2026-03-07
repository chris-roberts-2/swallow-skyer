"""
Project CRUD routes with Supabase-backed permissions.
"""

import os
from uuid import UUID

from flask import Blueprint, jsonify, request, g
from werkzeug.utils import secure_filename

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role, ROLE_ORDER
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client
import app.services.project_service as project_service
import app.services.plan_service as plan_service
from app.services.plan_rasterizer import rasterize_to_png, RasterizeError

projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")
VIEW_ROLES = set(ROLE_ORDER)
MANAGE_ROLES = {"Owner", "Administrator"}
OWNER_ONLY_ROLES = {"Owner"}
PLAN_ADMIN_ROLES = {"Owner", "Administrator"}
ALLOWED_PLAN_EXTENSIONS = {"pdf", "png", "jpeg", "jpg"}
MAX_PLAN_BYTES = 50 * 1024 * 1024
PNG_MIME = "image/png"


def _parse_coords(address, raw_lat, raw_lng):
    """
    Validate and parse coordinate inputs from a request payload.

    Returns (lat, lng, None) on success, or (None, None, error_message) on failure.
    Enforces that address and coordinates are mutually exclusive.
    """
    has_lat = raw_lat is not None
    has_lng = raw_lng is not None

    if not has_lat and not has_lng:
        return None, None, None

    if address and (has_lat or has_lng):
        return None, None, "Provide either address or coordinates, not both."

    if has_lat != has_lng:
        return None, None, "Both lat and lng are required when providing coordinates."

    try:
        lat = float(raw_lat)
        lng = float(raw_lng)
    except (TypeError, ValueError):
        return None, None, "lat and lng must be numeric values."

    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return None, None, "Coordinates are out of valid range."

    return lat, lng, None


def _require_auth():
    user = getattr(g, "current_user", None)
    user_id = None
    if isinstance(user, dict):
        user_id = user.get("id") or user.get("user_id") or user.get("sub")
    elif hasattr(user, "id"):
        user_id = getattr(user, "id")
    if not user_id:
        raise PermissionError("Authenticated user not found")
    return user_id


@projects_bp.route("", methods=["POST"])
@jwt_required
def create_project():
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    payload = request.get_json() or {}
    name = (payload.get("name") or "").strip()
    address = payload.get("address") or None
    raw_lat = payload.get("lat")
    raw_lng = payload.get("lng")

    if not name:
        return jsonify({"error": "Project name is required"}), 400

    lat, lng, coord_err = _parse_coords(address, raw_lat, raw_lng)
    if coord_err:
        return jsonify({"error": coord_err}), 400

    project, err = project_service.create_project_with_location(
        name=name,
        owner_id=user_id,
        address=address,
        lat=lat,
        lng=lng,
    )
    if err:
        geocode_err = err.get("geocode_error")
        status = 422 if geocode_err else 500
        return jsonify(err), status

    try:
        supabase_client.add_project_member(
            project_id=project["id"],
            user_id=user_id,
            role="Owner",
        )
        return jsonify(project), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@projects_bp.route("", methods=["GET"])
@jwt_required
def list_projects():
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        archived_flag = (request.args.get("archived") or "").strip().lower()
        show_on_projects = None
        if archived_flag in {"true", "1", "yes"}:
            show_on_projects = False
        elif archived_flag in {"false", "0", "no", ""}:
            show_on_projects = True
        projects = supabase_client.list_projects_for_user(
            user_id, show_on_projects=show_on_projects
        )
        return jsonify({"projects": projects})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@projects_bp.route("/<project_id>", methods=["GET"])
@jwt_required
def get_project(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    project = supabase_client.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    return jsonify(project)


@projects_bp.route("/<project_id>", methods=["PATCH"])
@jwt_required
def update_project(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, MANAGE_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    payload = request.get_json() or {}
    name = payload.get("name")
    address = payload.get("address")
    raw_lat = payload.get("lat")
    raw_lng = payload.get("lng")
    show_on_projects = payload.get("show_on_projects")

    if name is not None:
        name = name.strip()
        if not name:
            return jsonify({"error": "Project name cannot be empty"}), 400

    lat, lng, coord_err = _parse_coords(address, raw_lat, raw_lng)
    if coord_err:
        return jsonify({"error": coord_err}), 400

    updated, err = project_service.update_project_with_location(
        project_id=project_id,
        name=name,
        address=address,
        lat=lat,
        lng=lng,
        show_on_projects=show_on_projects,
    )
    if err:
        geocode_err = err.get("geocode_error")
        status = 422 if geocode_err else 500
        return jsonify(err), status
    if not updated:
        return jsonify({"error": "Project not found"}), 404
    return jsonify(updated)


@projects_bp.route("/<project_id>", methods=["DELETE"])
@jwt_required
def delete_project(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, OWNER_ONLY_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    try:
        updated = supabase_client.update_project(
            project_id=project_id, show_on_projects=False
        )
        if not updated:
            return jsonify({"error": "Project not found"}), 404
        return jsonify({"status": "hidden"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@projects_bp.route("/<project_id>/members", methods=["GET"])
@jwt_required
def list_project_members(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    try:
        members = supabase_client.list_project_members_with_profile(project_id)
        return jsonify({"members": members})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@projects_bp.route("/<project_id>/members/invite", methods=["POST"])
@jwt_required
def invite_project_member(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, MANAGE_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    actor_role = (permission.get("role") or "").lower()

    payload = request.get_json() or {}
    raw_email = (payload.get("email") or "").strip()
    requested_role = (payload.get("role") or "").strip().lower()

    role_map = {
        "administrator": "Administrator",
        "admin": "Administrator",
        "co-owner": "Administrator",
        "editor": "Editor",
        "collaborator": "Editor",
        "viewer": "Viewer",
        "owner": "Owner",
    }
    resolved_role = role_map.get(requested_role)

    if not raw_email or not resolved_role:
        return jsonify({"error": "Email and valid role are required"}), 400

    if resolved_role == "Owner" and actor_role != "owner":
        return jsonify({"error": "Only owners may assign owner role"}), 403
    if resolved_role == "Administrator" and actor_role not in {"owner", "administrator"}:
        return (
            jsonify({"error": "Only owners and administrators may assign administrators"}),
            403,
        )

    try:
        target_user = supabase_client.get_user_by_email(raw_email)
        if not target_user:
            target_user = supabase_client.create_user_with_email(raw_email)
        target_user_id = target_user.get("id") if target_user else None
        if not target_user_id:
            return jsonify({"error": "Failed to resolve or create user"}), 500

        project = supabase_client.get_project(project_id) or {}
        project_owner_id = project.get("owner_id")
        if project_owner_id and target_user_id == project_owner_id:
            if resolved_role != "Owner":
                return jsonify({"error": "Project creator must remain an Owner"}), 403

        if supabase_client.get_project_role(project_id, target_user_id):
            return jsonify({"error": "Member already exists"}), 400

        supabase_client.add_project_member(project_id, target_user_id, resolved_role)

        members = supabase_client.list_project_members_with_profile(project_id)
        member = next((m for m in members if m.get("user_id") == target_user_id), None)
        return jsonify({"member": member}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@projects_bp.route("/<project_id>/unjoin", methods=["POST"])
@jwt_required
def unjoin_project(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    project = supabase_client.get_project(project_id) or {}
    project_owner_id = project.get("owner_id")
    if project_owner_id and user_id == project_owner_id:
        return jsonify({"error": "Project creator cannot unjoin their project"}), 400

    try:
        removed = supabase_client.remove_project_member(project_id, user_id)
        return jsonify({"status": "removed" if removed else "not_found"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@projects_bp.route("/<project_id>/summary", methods=["GET"])
@jwt_required
def project_summary(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    project = supabase_client.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    members = []
    try:
        members = supabase_client.list_project_members_with_profile(project_id)
    except Exception:
        pass

    photo_count, location_count = 0, 0
    try:
        photo_count, location_count = supabase_client.get_project_stats(project_id)
    except Exception:
        pass

    return jsonify(
        {
            "project": project,
            "photo_count": photo_count,
            "location_count": location_count,
            "members": members,
        }
    )


@projects_bp.route("/<project_id>/location", methods=["GET"])
@jwt_required
def get_project_location_endpoint(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    location = supabase_client.get_project_location(project_id)
    return jsonify({"location": location})


@projects_bp.route("/<project_id>/location", methods=["PATCH"])
@jwt_required
def update_project_location(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, MANAGE_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    payload = request.get_json() or {}
    address = payload.get("address") or None
    raw_lat = payload.get("lat")
    raw_lng = payload.get("lng")

    if not address and raw_lat is None and raw_lng is None:
        return jsonify({"error": "Provide address or coordinates."}), 400

    lat, lng, coord_err = _parse_coords(address, raw_lat, raw_lng)
    if coord_err:
        return jsonify({"error": coord_err}), 400

    updated, err = project_service.update_project_with_location(
        project_id=project_id,
        address=address,
        lat=lat,
        lng=lng,
    )
    if err:
        geocode_err = err.get("geocode_error")
        status = 422 if geocode_err else 500
        return jsonify(err), status
    if not updated:
        return jsonify({"error": "Project not found"}), 404

    location = supabase_client.get_project_location(project_id)
    return jsonify({"project": updated, "location": location})


@projects_bp.route("/<project_id>/access", methods=["POST"])
@jwt_required
def touch_project_access(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        supabase_client.touch_project_access(project_id, user_id)
        return jsonify({"status": "ok"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


def _validate_project_id(project_id):
    """Validate project_id is a valid UUID. Raises ValueError on failure."""
    if not project_id:
        raise ValueError("project_id is required")
    try:
        return str(UUID(project_id))
    except (TypeError, ValueError) as exc:
        raise ValueError("project_id must be a valid UUID") from exc


def _parse_plan_bounds(form):
    """Parse min_lat, min_lng, max_lat, max_lng from form. Returns (min_lat, min_lng, max_lat, max_lng) or (None, None, None, None) with error."""
    try:
        min_lat = float(form.get("min_lat", ""))
        min_lng = float(form.get("min_lng", ""))
        max_lat = float(form.get("max_lat", ""))
        max_lng = float(form.get("max_lng", ""))
    except (TypeError, ValueError):
        return None, None, None, None, "Georeferencing bounds (min_lat, min_lng, max_lat, max_lng) are required and must be numeric."
    if not (-90 <= min_lat <= 90) or not (-90 <= max_lat <= 90):
        return None, None, None, None, "Latitude must be between -90 and 90."
    if not (-180 <= min_lng <= 180) or not (-180 <= max_lng <= 180):
        return None, None, None, None, "Longitude must be between -180 and 180."
    if min_lat >= max_lat or min_lng >= max_lng:
        return None, None, None, None, "min_lat must be less than max_lat, min_lng must be less than max_lng."
    return min_lat, min_lng, max_lat, max_lng, None


def _validate_rasterization_output(png_bytes, image_width, image_height):
    """
    Verify rasterization produced a valid PNG and dimensions.
    Returns (True, None) or (False, error_code, message).
    """
    if not png_bytes or not isinstance(png_bytes, bytes) or len(png_bytes) == 0:
        return False, "rasterization_failed", "Rasterization produced no image data."
    try:
        w = int(image_width)
        h = int(image_height)
    except (TypeError, ValueError):
        return False, "rasterization_failed", "Rasterization returned invalid dimensions."
    if w != image_width or h != image_height or w <= 0 or h <= 0:
        return False, "rasterization_failed", "Image dimensions must be positive integers."
    if len(png_bytes) < 8 or png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        return False, "rasterization_failed", "Rasterization did not produce a valid PNG image."
    return True, None, None


def _validate_plan_geometry(min_lat, min_lng, max_lat, max_lng):
    """
    Ensure the four corner coordinates form a non-degenerate quadrilateral.
    Returns (True, None) or (False, error_code, message).
    """
    if min_lat >= max_lat or min_lng >= max_lng:
        return False, "invalid_geometry", "Calibration produced invalid bounds; min must be less than max."
    area = (max_lat - min_lat) * (max_lng - min_lng)
    if area < 1e-12:
        return (
            False,
            "invalid_geometry",
            "Calibration points are too close or overlapping. Choose two points farther apart.",
        )
    return True, None, None


def _validate_plan_metadata(
    project_id,
    file_name,
    image_width,
    image_height,
    min_lat,
    min_lng,
    max_lat,
    max_lng,
):
    """
    Validate required plan metadata before storage.
    Returns (True, None) or (False, error_code, message).
    """
    if not project_id or not str(project_id).strip():
        return False, "invalid_metadata", "Project ID is required."
    if not file_name or not str(file_name).strip():
        return False, "invalid_metadata", "File name is required."
    try:
        w = int(image_width)
        h = int(image_height)
    except (TypeError, ValueError):
        return False, "invalid_metadata", "Image width and height must be positive integers."
    if w <= 0 or h <= 0:
        return False, "invalid_metadata", "Image width and height must be positive."
    if not isinstance(min_lat, (int, float)) or not isinstance(min_lng, (int, float)):
        return False, "invalid_metadata", "Corner coordinates must be numeric."
    if not isinstance(max_lat, (int, float)) or not isinstance(max_lng, (int, float)):
        return False, "invalid_metadata", "Corner coordinates must be numeric."
    if not (-90 <= min_lat <= 90) or not (-90 <= max_lat <= 90):
        return False, "invalid_metadata", "Latitude must be between -90 and 90."
    if not (-180 <= min_lng <= 180) or not (-180 <= max_lng <= 180):
        return False, "invalid_metadata", "Longitude must be between -180 and 180."
    return True, None, None


def _plan_error_response(error_code, message, status_code=400):
    """Return a consistent JSON error payload and status code."""
    return jsonify({"error": error_code, "message": message}), status_code


def _bounds_from_plan(plan):
    """
    Derive min_lat, min_lng, max_lat, max_lng from plan record with corner_* fields.
    Returns (min_lat, min_lng, max_lat, max_lng) or None if corners missing.
    """
    if not plan:
        return None
    keys = (
        "corner_nw_lat", "corner_nw_lng", "corner_ne_lat", "corner_ne_lng",
        "corner_se_lat", "corner_se_lng", "corner_sw_lat", "corner_sw_lng",
    )
    if any(plan.get(k) is None for k in keys):
        return None
    lats = [plan["corner_nw_lat"], plan["corner_ne_lat"], plan["corner_se_lat"], plan["corner_sw_lat"]]
    lngs = [plan["corner_nw_lng"], plan["corner_ne_lng"], plan["corner_se_lng"], plan["corner_sw_lng"]]
    return min(lats), min(lngs), max(lats), max(lngs)


def _plan_ext_from_filename(filename, mime_type):
    """Extract plan file extension (pdf, png, jpeg, jpg)."""
    _, ext = os.path.splitext(filename or "")
    cleaned = ext.lstrip(".").lower()
    if not cleaned and mime_type:
        part = (mime_type.split("/")[-1] if "/" in mime_type else mime_type).lower()
        if part in ALLOWED_PLAN_EXTENSIONS:
            cleaned = part
    cleaned = "".join(c for c in cleaned if c.isalnum())
    if cleaned == "jpg":
        cleaned = "jpeg"
    return cleaned if cleaned in ("pdf", "png", "jpeg") else None


def _read_plan_file_bytes(file_storage):
    """Read file bytes from FileStorage. Raises ValueError on empty."""
    stream = getattr(file_storage, "stream", None)
    if stream and hasattr(stream, "seek"):
        stream.seek(0)
        data = stream.read()
    else:
        data = file_storage.read()
    if not data:
        raise ValueError("Plan file is empty")
    return data


@projects_bp.route("/<project_id>/plan", methods=["POST"])
@jwt_required
def upload_project_plan(project_id):
    """Upload a georeferenced project plan. Requires Owner or Administrator."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        _validate_project_id(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    permission = require_role(project_id, PLAN_ADMIN_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    file_item = request.files.get("file")
    if not file_item or not getattr(file_item, "filename", None):
        return _plan_error_response(
            "invalid_file", "Plan file is required. Include a PDF, PNG, or JPEG file."
        )

    mime = (getattr(file_item, "mimetype", "") or "").lower()
    ext = _plan_ext_from_filename(file_item.filename, mime)
    if not ext:
        return _plan_error_response(
            "invalid_metadata", "Plan must be PDF, PNG, or JPEG."
        )

    min_lat, min_lng, max_lat, max_lng, bounds_err = _parse_plan_bounds(request.form)
    if bounds_err:
        return _plan_error_response("invalid_metadata", bounds_err)

    existing = plan_service.get_plan_by_project_id(project_id)
    if existing:
        return _plan_error_response(
            "plan_already_exists",
            "Project already has a plan. Use Replace plan to overwrite.",
            409,
        )

    if not r2_client.client:
        config_msg = getattr(r2_client, "_config_error", None) or "Check R2 environment variables."
        return _plan_error_response("storage_not_configured", config_msg, 500)

    if not supabase_client.client:
        return _plan_error_response(
            "database_not_configured",
            "Check Supabase environment variables.",
            500,
        )

    try:
        file_bytes = _read_plan_file_bytes(file_item)
    except ValueError as exc:
        return _plan_error_response("invalid_file", str(exc))

    if len(file_bytes) > MAX_PLAN_BYTES:
        return _plan_error_response(
            "invalid_file",
            f"Plan file too large (max {MAX_PLAN_BYTES // (1024 * 1024)}MB).",
            413,
        )

    try:
        png_bytes, image_width, image_height = rasterize_to_png(
            file_bytes,
            filename_hint=file_item.filename or "",
            mime_hint=mime,
        )
    except RasterizeError as e:
        return _plan_error_response("rasterization_failed", e.message)

    ok, err_code, err_msg = _validate_rasterization_output(
        png_bytes, image_width, image_height
    )
    if not ok:
        return _plan_error_response(err_code, err_msg)

    ok, err_code, err_msg = _validate_plan_geometry(
        min_lat, min_lng, max_lat, max_lng
    )
    if not ok:
        return _plan_error_response(err_code, err_msg)

    ok, err_code, err_msg = _validate_plan_metadata(
        project_id,
        "plan.png",
        image_width,
        image_height,
        min_lat,
        min_lng,
        max_lat,
        max_lng,
    )
    if not ok:
        return _plan_error_response(err_code, err_msg)

    try:
        r2_key = r2_client.upload_project_plan(
            project_id, png_bytes, "png", content_type=PNG_MIME
        )
    except Exception:
        return _plan_error_response(
            "upload_failed", "Failed to upload plan to storage.", 500
        )

    if not r2_key:
        return _plan_error_response(
            "upload_failed", "Failed to upload plan to storage.", 502
        )

    try:
        supabase_client.ensure_user_exists(user_id)
    except Exception:
        pass

    try:
        record = plan_service.create_plan_record(
            project_id=project_id,
            r2_path=r2_key,
            file_name="plan.png",
            file_type=PNG_MIME,
            user_id=user_id,
            min_lat=min_lat,
            min_lng=min_lng,
            max_lat=max_lat,
            max_lng=max_lng,
            image_width=image_width,
            image_height=image_height,
        )
    except Exception:
        r2_client.delete_file(r2_key)
        return _plan_error_response(
            "database_error", "Failed to store plan metadata.", 500
        )

    if not record:
        r2_client.delete_file(r2_key)
        return _plan_error_response(
            "database_error", "Failed to store plan metadata.", 502
        )

    signed_url = r2_client.generate_presigned_url(r2_key, expires_in=600)
    bounds = _bounds_from_plan(record)
    min_lat_r, min_lng_r, max_lat_r, max_lng_r = bounds if bounds else (min_lat, min_lng, max_lat, max_lng)
    response_data = {
        "project_id": project_id,
        "r2_path": r2_key,
        "file_name": record.get("file_name"),
        "file_type": record.get("file_type"),
        "user_id": record.get("uploaded_by_user_id"),
        "image_width": record.get("image_width"),
        "image_height": record.get("image_height"),
        "min_lat": min_lat_r,
        "min_lng": min_lng_r,
        "max_lat": max_lat_r,
        "max_lng": max_lng_r,
        "image_url": signed_url,
        "uploaded_at": record.get("uploaded_at"),
    }
    return jsonify(response_data), 201


CALIBRATION_PLAN_KEY_TEMPLATE = "projects/{project_id}/plans/calibration.png"


@projects_bp.route("/<project_id>/plan/calibration", methods=["POST"])
@jwt_required
def upload_project_plan_calibration(project_id):
    """Upload a plan file for calibration only. Rasterizes and returns image URL + dimensions. No DB write."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        _validate_project_id(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    permission = require_role(project_id, PLAN_ADMIN_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    file_item = request.files.get("file")
    if not file_item or not getattr(file_item, "filename", None):
        return _plan_error_response(
            "invalid_file", "Plan file is required. Include a PDF, PNG, or JPEG file."
        )

    mime = (getattr(file_item, "mimetype", "") or "").lower()
    ext = _plan_ext_from_filename(file_item.filename, mime)
    if not ext:
        return _plan_error_response(
            "invalid_metadata", "Plan must be PDF, PNG, or JPEG."
        )

    if not r2_client.client:
        config_msg = getattr(r2_client, "_config_error", None) or "Check R2 environment variables."
        return _plan_error_response("storage_not_configured", config_msg, 500)

    try:
        file_bytes = _read_plan_file_bytes(file_item)
    except ValueError as exc:
        return _plan_error_response("invalid_file", str(exc))

    if len(file_bytes) > MAX_PLAN_BYTES:
        return _plan_error_response(
            "invalid_file",
            f"Plan file too large (max {MAX_PLAN_BYTES // (1024 * 1024)}MB).",
            413,
        )

    try:
        png_bytes, image_width, image_height = rasterize_to_png(
            file_bytes,
            filename_hint=file_item.filename or "",
            mime_hint=mime,
        )
    except RasterizeError as e:
        return _plan_error_response("rasterization_failed", e.message)

    ok, err_code, err_msg = _validate_rasterization_output(
        png_bytes, image_width, image_height
    )
    if not ok:
        return _plan_error_response(err_code, err_msg)

    key = CALIBRATION_PLAN_KEY_TEMPLATE.format(project_id=project_id)
    try:
        ok = r2_client.upload_bytes(png_bytes, key, content_type=PNG_MIME)
    except Exception:
        return _plan_error_response(
            "upload_failed", "Failed to upload calibration image.", 500
        )

    if not ok:
        return _plan_error_response(
            "upload_failed", "Failed to upload calibration image.", 502
        )

    signed_url = r2_client.generate_presigned_url(key, expires_in=600)
    return (
        jsonify({
            "image_url": signed_url,
            "image_width": image_width,
            "image_height": image_height,
        }),
        200,
    )


@projects_bp.route("/<project_id>/plan", methods=["GET"])
@jwt_required
def get_project_plan(project_id):
    """Retrieve project plan metadata and signed image URL. Requires project membership."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        _validate_project_id(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    plan = plan_service.get_plan_by_project_id(project_id)
    if not plan:
        return jsonify({"plan": None, "message": "No plan available for this project"}), 200

    r2_path = plan.get("r2_path")
    signed_url = r2_client.generate_presigned_url(r2_path, expires_in=600) if r2_path and r2_client.client else None
    bounds = _bounds_from_plan(plan)
    min_lat_p, min_lng_p, max_lat_p, max_lng_p = bounds if bounds else (None, None, None, None)

    response_data = {
        "plan": {
            "project_id": plan.get("project_id"),
            "r2_path": r2_path,
            "file_name": plan.get("file_name"),
            "file_type": plan.get("file_type"),
            "user_id": plan.get("uploaded_by_user_id"),
            "image_width": plan.get("image_width"),
            "image_height": plan.get("image_height"),
            "min_lat": min_lat_p,
            "min_lng": min_lng_p,
            "max_lat": max_lat_p,
            "max_lng": max_lng_p,
            "image_url": signed_url,
            "uploaded_at": plan.get("uploaded_at"),
        }
    }
    return jsonify(response_data), 200


@projects_bp.route("/<project_id>/plan", methods=["PATCH"])
@jwt_required
def replace_project_plan(project_id):
    """Replace the existing project plan. Requires Owner or Administrator."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        _validate_project_id(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    permission = require_role(project_id, PLAN_ADMIN_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    existing = plan_service.get_plan_by_project_id(project_id)
    if not existing:
        return _plan_error_response(
            "not_found", "No plan exists for this project. Use Upload plan first.", 404
        )

    file_item = request.files.get("file")
    if not file_item or not getattr(file_item, "filename", None):
        return _plan_error_response(
            "invalid_file", "Plan file is required. Include a PDF, PNG, or JPEG file."
        )

    mime = (getattr(file_item, "mimetype", "") or "").lower()
    ext = _plan_ext_from_filename(file_item.filename, mime)
    if not ext:
        return _plan_error_response(
            "invalid_metadata", "Plan must be PDF, PNG, or JPEG."
        )

    min_lat, min_lng, max_lat, max_lng, bounds_err = _parse_plan_bounds(request.form)
    if bounds_err:
        return _plan_error_response("invalid_metadata", bounds_err)

    if not r2_client.client:
        config_msg = getattr(r2_client, "_config_error", None) or "Check R2 environment variables."
        return _plan_error_response("storage_not_configured", config_msg, 500)

    try:
        file_bytes = _read_plan_file_bytes(file_item)
    except ValueError as exc:
        return _plan_error_response("invalid_file", str(exc))

    if len(file_bytes) > MAX_PLAN_BYTES:
        return _plan_error_response(
            "invalid_file",
            f"Plan file too large (max {MAX_PLAN_BYTES // (1024 * 1024)}MB).",
            413,
        )

    try:
        png_bytes, image_width, image_height = rasterize_to_png(
            file_bytes,
            filename_hint=file_item.filename or "",
            mime_hint=mime,
        )
    except RasterizeError as e:
        return _plan_error_response("rasterization_failed", e.message)

    ok, err_code, err_msg = _validate_rasterization_output(
        png_bytes, image_width, image_height
    )
    if not ok:
        return _plan_error_response(err_code, err_msg)

    ok, err_code, err_msg = _validate_plan_geometry(
        min_lat, min_lng, max_lat, max_lng
    )
    if not ok:
        return _plan_error_response(err_code, err_msg)

    ok, err_code, err_msg = _validate_plan_metadata(
        project_id,
        "plan.png",
        image_width,
        image_height,
        min_lat,
        min_lng,
        max_lat,
        max_lng,
    )
    if not ok:
        return _plan_error_response(err_code, err_msg)

    try:
        r2_key = r2_client.upload_project_plan(
            project_id, png_bytes, "png", content_type=PNG_MIME
        )
    except Exception:
        return _plan_error_response(
            "upload_failed", "Failed to upload plan to storage.", 500
        )

    if not r2_key:
        return _plan_error_response(
            "upload_failed", "Failed to upload plan to storage.", 502
        )

    try:
        record = plan_service.replace_plan(
            project_id=project_id,
            r2_path=r2_key,
            file_name="plan.png",
            file_type=PNG_MIME,
            user_id=user_id,
            min_lat=min_lat,
            min_lng=min_lng,
            max_lat=max_lat,
            max_lng=max_lng,
            image_width=image_width,
            image_height=image_height,
        )
    except Exception:
        r2_client.delete_file(r2_key)
        return _plan_error_response(
            "database_error", "Failed to update plan metadata.", 500
        )

    if not record:
        r2_client.delete_file(r2_key)
        return _plan_error_response(
            "database_error", "Failed to update plan metadata.", 502
        )

    signed_url = r2_client.generate_presigned_url(r2_key, expires_in=600)
    bounds = _bounds_from_plan(record)
    min_lat_r, min_lng_r, max_lat_r, max_lng_r = bounds if bounds else (min_lat, min_lng, max_lat, max_lng)
    response_data = {
        "project_id": project_id,
        "r2_path": r2_key,
        "file_name": record.get("file_name"),
        "file_type": record.get("file_type"),
        "user_id": record.get("uploaded_by_user_id"),
        "image_width": record.get("image_width"),
        "image_height": record.get("image_height"),
        "min_lat": min_lat_r,
        "min_lng": min_lng_r,
        "max_lat": max_lat_r,
        "max_lng": max_lng_r,
        "image_url": signed_url,
        "uploaded_at": record.get("uploaded_at"),
    }
    return jsonify(response_data), 200


@projects_bp.route("/<project_id>/plan", methods=["DELETE"])
@jwt_required
def delete_project_plan(project_id):
    """Delete the project plan. Requires Owner or Administrator."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        _validate_project_id(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    permission = require_role(project_id, PLAN_ADMIN_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    deleted = plan_service.delete_plan(project_id)
    if not deleted:
        return jsonify({"error": "not_found", "message": "No plan exists for this project"}), 404

    return jsonify({"message": "Plan removed successfully"}), 200
