"""
Project member management routes enforcing Supabase roles.
"""

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.storage.supabase_client import supabase_client

project_members_bp = Blueprint(
    "project_members", __name__, url_prefix="/api/v1/projects/<project_id>/members"
)

VALID_ROLES = {"owner", "co-owner", "collaborator", "viewer"}


def _current_user_id():
    user = getattr(g, "current_user", {})
    if isinstance(user, dict):
        return user.get("id") or user.get("user_id") or user.get("sub")
    if hasattr(user, "id"):
        return getattr(user, "id")
    return None


def _role_for(project_id, user_id):
    return supabase_client.get_project_role(project_id, user_id)


def _json_error(message, status=400):
    return jsonify({"success": False, "error": message}), status


@project_members_bp.route("", methods=["GET"])
@jwt_required
def list_members(project_id):
    user_id = _current_user_id()
    if not user_id:
        return _json_error("Unauthorized", 401)

    role = _role_for(project_id, user_id)
    if not role:
        return _json_error("Not authorized for this project", 403)

    members = supabase_client.list_project_members(project_id)
    return jsonify({"success": True, "data": members})


@project_members_bp.route("", methods=["POST"])
@jwt_required
def add_member(project_id):
    user_id = _current_user_id()
    if not user_id:
        return _json_error("Unauthorized", 401)

    actor_role = _role_for(project_id, user_id)
    if actor_role not in ("owner", "co-owner"):
        return _json_error("Only owners or co-owners may add members", 403)

    payload = request.get_json() or {}
    target_user_id = payload.get("user_id")
    role = payload.get("role")

    if not target_user_id or role not in VALID_ROLES:
        return _json_error("user_id and valid role are required", 400)

    if role == "owner" and actor_role != "owner":
        return _json_error("Only owners may assign owner role", 403)

    if _role_for(project_id, target_user_id):
        return _json_error("Member already exists", 400)

    member = supabase_client.add_project_member(project_id, target_user_id, role)
    return jsonify({"success": True, "data": member}), 201


@project_members_bp.route("/<target_user_id>", methods=["PATCH"])
@jwt_required
def update_member(project_id, target_user_id):
    user_id = _current_user_id()
    if not user_id:
        return _json_error("Unauthorized", 401)

    actor_role = _role_for(project_id, user_id)
    if actor_role not in ("owner", "co-owner"):
        return _json_error("Only owners or co-owners may update members", 403)

    payload = request.get_json() or {}
    new_role = payload.get("role")

    if new_role not in VALID_ROLES:
        return _json_error("Invalid role", 400)

    current_role = _role_for(project_id, target_user_id)
    if not current_role:
        return _json_error("Member not found", 404)

    if current_role == "owner" and actor_role != "owner":
        return _json_error("Only owners may modify other owners", 403)

    if new_role == "owner" and actor_role != "owner":
        return _json_error("Only owners may promote to owner", 403)

    if current_role in ("owner", "co-owner") and new_role not in ("owner", "co-owner"):
        owner_count = supabase_client.count_owners(project_id)
        if owner_count <= 1:
            return _json_error("Cannot remove last owner/co-owner", 400)

    member = supabase_client.update_project_member_role(
        project_id, target_user_id, new_role
    )
    return jsonify({"success": True, "data": member})


@project_members_bp.route("/<target_user_id>", methods=["DELETE"])
@jwt_required
def remove_member(project_id, target_user_id):
    user_id = _current_user_id()
    if not user_id:
        return _json_error("Unauthorized", 401)

    actor_role = _role_for(project_id, user_id)
    if actor_role not in ("owner", "co-owner"):
        return _json_error("Only owners or co-owners may remove members", 403)

    target_role = _role_for(project_id, target_user_id)
    if not target_role:
        return _json_error("Member not found", 404)

    if target_role == "owner":
        if actor_role != "owner":
            return _json_error("Only owners may remove other owners", 403)
        owner_count = supabase_client.count_owners(project_id)
        if owner_count <= 1:
            return _json_error("Cannot remove last owner", 400)

    deleted = supabase_client.remove_project_member(project_id, target_user_id)
    if not deleted:
        return _json_error("Failed to remove member", 500)

    return jsonify({"success": True, "data": {"removed": target_user_id}})

