"""
Project CRUD routes with Supabase-backed permissions.
"""

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role, ROLE_ORDER
from app.services.storage.supabase_client import supabase_client

projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")
VIEW_ROLES = set(ROLE_ORDER)
OWNER_ROLES = {"owner", "co-owner"}


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
    description = payload.get("description")

    if not name:
        return jsonify({"error": "Project name is required"}), 400

    try:
        project = supabase_client.create_project(
            name=name,
            description=description,
            owner_id=user_id,
        )
        supabase_client.add_project_member(
            project_id=project["id"],
            user_id=user_id,
            role="owner",
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
        projects = supabase_client.list_projects_for_user(user_id)
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

    permission = require_role(project_id, OWNER_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    payload = request.get_json() or {}
    name = payload.get("name")
    description = payload.get("description")
    if name is not None:
        name = name.strip()
        if not name:
            return jsonify({"error": "Project name cannot be empty"}), 400

    try:
        updated = supabase_client.update_project(
            project_id=project_id,
            name=name,
            description=description,
        )
        if not updated:
            return jsonify({"error": "Project not found"}), 404
        return jsonify(updated)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@projects_bp.route("/<project_id>", methods=["DELETE"])
@jwt_required
def delete_project(project_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    permission = require_role(project_id, OWNER_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    try:
        deleted = supabase_client.delete_project(project_id)
        if not deleted:
            return jsonify({"error": "Project not found"}), 404
        return jsonify({"status": "deleted"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
