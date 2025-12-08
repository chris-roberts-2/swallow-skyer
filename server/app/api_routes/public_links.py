import secrets
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

from flask import Blueprint, jsonify, request

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client

bp = Blueprint("public_links", __name__)

OWNER_ROLES = {"owner", "co-owner"}
PUBLIC_TOKEN_TABLE = "project_public_links"
DEFAULT_DENIED_MESSAGE = "You do not have permission for this action."


def _forbidden(message: str = DEFAULT_DENIED_MESSAGE):
    return {"error": "forbidden", "message": message}, 403


def _expired():
    return {"error": "expired", "message": "This link has expired."}, 410


def _not_found(message: str = "Not found"):
    return {"error": "not_found", "message": message}, 404


def _now_utc():
    return datetime.now(timezone.utc)


def _load_link_by_token(token: str) -> Optional[Dict]:
    if not supabase_client.client:
        return None
    response = (
        supabase_client.client.table(PUBLIC_TOKEN_TABLE)
        .select("*")
        .eq("token", token)
        .maybe_single()
        .execute()
    )
    return response.data if hasattr(response, "data") else None


def _load_link_by_id(link_id: str) -> Optional[Dict]:
    if not supabase_client.client:
        return None
    response = (
        supabase_client.client.table(PUBLIC_TOKEN_TABLE)
        .select("*")
        .eq("id", link_id)
        .maybe_single()
        .execute()
    )
    return response.data if hasattr(response, "data") else None


def _is_expired(record: Dict) -> bool:
    expires_at = record.get("expires_at")
    if not expires_at:
        return False
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(
                expires_at.replace("Z", "+00:00")
            )
        except Exception:
            return False
    return expires_at < _now_utc()


def _sanitize_photo(record: Dict) -> Dict:
    return {
        "id": record.get("id"),
        "project_id": record.get("project_id"),
        "caption": record.get("caption"),
        "latitude": record.get("latitude"),
        "longitude": record.get("longitude"),
        "created_at": record.get("created_at"),
        "captured_at": record.get("captured_at"),
        "r2_url": record.get("r2_url") or record.get("url"),
        "thumbnail_r2_url": record.get("thumbnail_r2_url")
        or record.get("thumbnail_url"),
    }


def _sanitize_project(project: Dict) -> Dict:
    return {
        "id": project.get("id"),
        "name": project.get("name"),
        "description": project.get("description"),
        "created_at": project.get("created_at"),
    }


@bp.route("/api/v1/projects/<project_id>/public-links", methods=["POST"])
@jwt_required
def create_public_link(project_id: str):
    permission = require_role(project_id, OWNER_ROLES)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    payload = request.get_json() or {}
    expires_at = payload.get("expires_at")
    token = secrets.token_urlsafe(32)

    if not supabase_client.client:
        return jsonify({"error": "Server not configured"}), 500

    insert_payload = {
        "project_id": project_id,
        "token": token,
        "expires_at": expires_at,
    }
    response = (
        supabase_client.client.table(PUBLIC_TOKEN_TABLE)
        .insert(insert_payload)
        .select("*")
        .maybe_single()
        .execute()
    )
    record = response.data if hasattr(response, "data") else None
    if not record:
        return jsonify({"error": "failed", "message": "Could not create link"}), 500

    base_url = request.url_root.rstrip("/")
    return (
        jsonify(
            {
                "id": record.get("id"),
                "url": f"{base_url}/public/{token}",
                "token": token,
                "expires_at": record.get("expires_at"),
            }
        ),
        201,
    )


@bp.route("/api/v1/projects/<project_id>/public-links", methods=["GET"])
@jwt_required
def list_public_links(project_id: str):
    permission = require_role(project_id, OWNER_ROLES)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    if not supabase_client.client:
        return jsonify({"error": "Server not configured"}), 500

    response = (
        supabase_client.client.table(PUBLIC_TOKEN_TABLE)
        .select("*")
        .eq("project_id", project_id)
        .execute()
    )
    records = response.data if hasattr(response, "data") else []
    return jsonify({"links": records})


@bp.route("/api/v1/public-links/<link_id>", methods=["DELETE"])
@jwt_required
def delete_public_link(link_id: str):
    record = _load_link_by_id(link_id)
    if not record:
        payload, status_code = _not_found("Link not found")
        return jsonify(payload), status_code

    project_id = record.get("project_id")
    permission = require_role(project_id, OWNER_ROLES)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    supabase_client.client.table(PUBLIC_TOKEN_TABLE).delete().eq("id", link_id).execute()
    return jsonify({"status": "deleted"})


def _validate_public_token(token: str) -> Tuple[Optional[Dict], Optional[Tuple[dict, int]]]:
    record = _load_link_by_token(token)
    if not record:
        return None, _not_found("Public link not found")
    if _is_expired(record):
        return None, _expired()
    return record, None


@bp.route("/api/v1/public/<token>/project", methods=["GET"])
def get_public_project(token: str):
    record, error = _validate_public_token(token)
    if error:
        payload, status = error
        return jsonify(payload), status

    project = supabase_client.get_project(record.get("project_id"))
    if not project:
        payload, status = _not_found("Project not found")
        return jsonify(payload), status

    return jsonify({"project": _sanitize_project(project)})


@bp.route("/api/v1/public/<token>/photos", methods=["GET"])
def get_public_photos(token: str):
    record, error = _validate_public_token(token)
    if error:
        payload, status = error
        return jsonify(payload), status

    project_id = record.get("project_id")
    try:
        result = supabase_client.fetch_project_photos(
            project_ids=[project_id],
            include_signed_urls=True,
            page=1,
            page_size=200,
        )
    except Exception:
        result = {"data": [], "count": 0}

    photos = [_sanitize_photo(row) for row in result.get("data", []) or []]
    return jsonify({"photos": photos})


@bp.route("/api/v1/public/<token>/photos/<photo_id>/download", methods=["GET"])
def public_presigned_download(token: str, photo_id: str):
    record, error = _validate_public_token(token)
    if error:
        payload, status = error
        return jsonify(payload), status

    project_id = record.get("project_id")
    photo = supabase_client.get_photo_metadata(photo_id)
    if not photo:
        payload, status = _not_found("Photo not found")
        return jsonify(payload), status

    if str(photo.get("project_id")) != str(project_id):
        payload, status = _forbidden()
        return jsonify(payload), status

    r2_path = photo.get("r2_path")
    if not r2_path:
        payload, status = _not_found("Photo storage not found")
        return jsonify(payload), status

    signed = r2_client.generate_presigned_url(r2_path, expires_in=900)
    if not signed:
        payload, status = _forbidden()
        return jsonify(payload), status

    return jsonify({"url": signed})

