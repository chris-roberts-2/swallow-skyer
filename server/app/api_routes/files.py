from flask import Blueprint, jsonify, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client

bp = Blueprint("files", __name__)

ALLOWED_ROLES = {"owner", "co-owner", "collaborator", "viewer"}
DEFAULT_DENIED_MESSAGE = "You do not have permission for this action."


@bp.route(
    "/api/v1/projects/<project_id>/photos/<photo_id>/download", methods=["GET"]
)
@jwt_required
def presigned_download(project_id: str, photo_id: str):
    permission = require_role(project_id, ALLOWED_ROLES)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    record = supabase_client.get_photo_metadata(photo_id)
    if not record:
        return (
            jsonify({"error": "not_found", "message": "Photo not found"}),
            404,
        )

    record_project_id = record.get("project_id")
    if str(record_project_id) != str(project_id):
        return (
            jsonify({"error": "forbidden", "message": DEFAULT_DENIED_MESSAGE}),
            403,
        )

    r2_path = record.get("r2_path")
    if not r2_path:
        return (
            jsonify(
                {
                    "error": "not_found",
                    "message": "Photo storage path not available",
                }
            ),
            404,
        )

    signed_url = r2_client.generate_presigned_url(r2_path, expires_in=1200)
    if not signed_url:
        return (
            jsonify(
                {
                    "error": "forbidden",
                    "message": DEFAULT_DENIED_MESSAGE,
                }
            ),
            403,
        )

    return jsonify({"url": signed_url})

