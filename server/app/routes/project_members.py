"""
Project member management routes enforcing Supabase roles.
"""

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.storage.supabase_client import supabase_client
from app.services.auth.permissions import require_role, ROLE_ORDER

project_members_bp = Blueprint(
    "project_members", __name__, url_prefix="/api/v1/projects/<project_id>/members"
)

ROLE_MAP = {
    "owner": "Owner",
    "administrator": "Administrator",
    "admin": "Administrator",
    "co-owner": "Administrator",
    "editor": "Editor",
    "collaborator": "Editor",
    "viewer": "Viewer",
}
VALID_ROLES = {"Owner", "Administrator", "Editor", "Viewer"}
VIEW_ROLES = set(ROLE_ORDER)
MANAGE_ROLES = {"Owner", "Administrator"}


def _normalize_role(value):
    if not value:
        return None
    cleaned = str(value).strip()
    return ROLE_MAP.get(cleaned.lower(), cleaned)


def _get_project_owner_id(project_id):
    project = supabase_client.get_project(project_id) or {}
    return project.get("owner_id")


def _json_error(message, status=400):
    if status == 403:
        return jsonify({"error": "forbidden", "message": message}), status
    return jsonify({"success": False, "error": message}), status


@project_members_bp.route("", methods=["GET"])
@jwt_required
def list_members(project_id):
    permission = require_role(project_id, VIEW_ROLES)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    members = supabase_client.list_project_members_with_profile(project_id)
    return jsonify({"members": members})


@project_members_bp.route("", methods=["POST"])
@jwt_required
def add_member(project_id):
    permission = require_role(project_id, MANAGE_ROLES)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    actor_role = (permission.get("role") or "").lower()

    payload = request.get_json() or {}
    target_user_id = payload.get("user_id")
    role = _normalize_role(payload.get("role"))

    if not target_user_id or role not in VALID_ROLES:
        return _json_error("user_id and valid role are required", 400)

    project_owner_id = _get_project_owner_id(project_id)
    if project_owner_id and target_user_id == project_owner_id and role != "Owner":
        return _json_error("Project creator must remain an Owner", 403)

    if role == "Owner" and actor_role != "owner":
        return _json_error("Only owners may assign owner role", 403)

    if supabase_client.get_project_role(project_id, target_user_id):
        return _json_error("Member already exists", 400)

    member = supabase_client.add_project_member(project_id, target_user_id, role)
    return jsonify({"success": True, "data": member}), 201


@project_members_bp.route("/<target_user_id>", methods=["PATCH"])
@jwt_required
def update_member(project_id, target_user_id):
    permission = require_role(project_id, MANAGE_ROLES)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    actor_role = (permission.get("role") or "").lower()

    payload = request.get_json() or {}
    new_role = _normalize_role(payload.get("role"))

    if new_role not in VALID_ROLES:
        return _json_error("Invalid role", 400)

    current_role = supabase_client.get_project_role(project_id, target_user_id)
    if not current_role:
        return _json_error("Member not found", 404)

    project_owner_id = _get_project_owner_id(project_id)
    if project_owner_id and target_user_id == project_owner_id:
        if new_role != "Owner":
            return _json_error("Project creator must remain an Owner", 403)

    if current_role == "Owner" and actor_role != "owner":
        return _json_error("Only owners may modify other owners", 403)

    if new_role == "Owner" and actor_role != "owner":
        return _json_error("Only owners may promote to owner", 403)

    if current_role == "Owner" and new_role != "Owner":
        owner_count = supabase_client.count_owners(project_id)
        if owner_count <= 1:
            return _json_error("Cannot remove last owner", 400)

    member = supabase_client.update_project_member_role(
        project_id, target_user_id, new_role
    )
    return jsonify({"success": True, "data": member})


@project_members_bp.route("/<target_user_id>", methods=["DELETE"])
@jwt_required
def remove_member(project_id, target_user_id):
    permission = require_role(project_id, MANAGE_ROLES)
    if isinstance(permission, tuple):
        payload, status_code = permission
        return jsonify(payload), status_code

    actor_role = (permission.get("role") or "").lower()

    target_role = supabase_client.get_project_role(project_id, target_user_id)
    if not target_role:
        return _json_error("Member not found", 404)

    project_owner_id = _get_project_owner_id(project_id)
    if project_owner_id and target_user_id == project_owner_id:
        return _json_error("Project creator cannot be removed", 403)

    if target_role == "Owner":
        if actor_role != "owner":
            return _json_error("Only owners may remove other owners", 403)
        owner_count = supabase_client.count_owners(project_id)
        if owner_count <= 1:
            return _json_error("Cannot remove last owner", 400)

    deleted = supabase_client.remove_project_member(project_id, target_user_id)
    if not deleted:
        return _json_error("Failed to remove member", 500)

    return jsonify({"success": True, "data": {"removed": target_user_id}})

