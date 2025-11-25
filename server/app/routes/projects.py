"""
Project CRUD routes with Supabase-backed permissions.
"""

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.storage.supabase_client import supabase_client

projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")


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


def _get_user_role(project_id, user_id):
    return supabase_client.get_project_role(project_id, user_id)


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

    role = _get_user_role(project_id, user_id)
    if not role:
        return jsonify({"error": "Not authorized for this project"}), 403

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

    role = _get_user_role(project_id, user_id)
    if role not in ("owner", "co-owner"):
        return jsonify({"error": "Only owners or co-owners may update"}), 403

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

    role = _get_user_role(project_id, user_id)
    if role not in ("owner", "co-owner"):
        return jsonify({"error": "Only owners or co-owners may delete"}), 403

    try:
        deleted = supabase_client.delete_project(project_id)
        if not deleted:
            return jsonify({"error": "Project not found"}), 404
        return jsonify({"status": "deleted"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
