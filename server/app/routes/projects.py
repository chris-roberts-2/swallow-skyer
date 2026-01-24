"""
Project CRUD routes with Supabase-backed permissions.
"""

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role, ROLE_ORDER
from app.services.storage.supabase_client import supabase_client

projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")
VIEW_ROLES = set(ROLE_ORDER)
MANAGE_ROLES = {"Owner", "Administrator"}
OWNER_ONLY_ROLES = {"Owner"}


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
    address = payload.get("address")
    email = payload.get("email") or payload.get("owner_email")

    if not name:
        return jsonify({"error": "Project name is required"}), 400

    try:
        project = supabase_client.create_project(
            name=name,
            description=None,
            owner_id=user_id,
            address=address,
        )
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
    description = None  # deprecated
    address = payload.get("address")
    show_on_projects = payload.get("show_on_projects")
    if name is not None:
        name = name.strip()
        if not name:
            return jsonify({"error": "Project name cannot be empty"}), 400

    try:
        updated = supabase_client.update_project(
            project_id=project_id,
            name=name,
            address=address,
            show_on_projects=show_on_projects,
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
