"""
Project-level permission utilities.
"""

from typing import Iterable, Optional, Set, Tuple, Union

from flask import g, has_request_context

from app.services.storage.supabase_client import supabase_client

JsonResponse = Tuple[dict, int]
PermissionResult = Union[JsonResponse, dict]

ROLE_ORDER = ["viewer", "collaborator", "co-owner", "owner"]
DEFAULT_DENIED_MESSAGE = "You do not have permission for this action."


def _current_user_id() -> Optional[str]:
    if not has_request_context():
        return None
    user = getattr(g, "current_user", None)
    if isinstance(user, dict):
        return user.get("id") or user.get("user_id") or user.get("sub")
    if hasattr(user, "id"):
        return getattr(user, "id")
    return None


def _forbidden(message: str) -> JsonResponse:
    return {"error": "forbidden", "message": message}, 403


def _normalize_roles(allowed_roles: Iterable[str]) -> Set[str]:
    return {role.strip().lower() for role in allowed_roles if role}


def require_role(
    project_id: Optional[str],
    allowed_roles: Iterable[str],
    *,
    user_id: Optional[str] = None,
) -> PermissionResult:
    """
    Ensure the current user has one of the allowed roles for a project.

    Args:
        project_id: Supabase project id.
        allowed_roles: Iterable of acceptable roles.
        user_id: Optional explicit user id override (defaults to g.current_user).

    Returns:
        dict with user_id and role on success, or (json, status) tuple on failure.
    """
    if not project_id:
        return _forbidden("project_id is required")

    resolved_user_id = user_id or _current_user_id()
    if not resolved_user_id:
        return _forbidden("Authentication required")

    allowed = _normalize_roles(allowed_roles)
    try:
        role = supabase_client.get_project_role(project_id, resolved_user_id)
    except Exception as exc:  # pragma: no cover - supabase client errors vary
        return _forbidden(f"Unable to verify permissions: {exc}")

    if not role:
        return _forbidden("You do not belong to this project.")

    normalized_role = role.lower()
    if allowed and normalized_role not in allowed:
        return _forbidden(DEFAULT_DENIED_MESSAGE)

    return {"user_id": resolved_user_id, "role": role}


