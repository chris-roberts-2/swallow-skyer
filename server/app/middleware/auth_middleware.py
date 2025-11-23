from functools import wraps

from flask import jsonify, g, request

from app.services.auth_service import AuthError, AuthService
from app.supabase_client import verify_supabase_jwt

auth_service = AuthService()


def _serialize_user(user):
    if isinstance(user, dict):
        return user
    if hasattr(user, "to_dict"):
        return user.to_dict()
    return {"user": user}


def jwt_required(fn):
    """Protect an endpoint with JWT access token verification."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization header missing"}), 401

        token = auth_header.split(" ", 1)[1].strip()
        if not token:
            return jsonify({"error": "Authorization token missing"}), 401

        supabase_user = None
        try:
            supabase_user = verify_supabase_jwt(token)
        except RuntimeError:
            supabase_user = None
        except (ValueError, PermissionError) as exc:
            return jsonify({"error": str(exc)}), 401

        if supabase_user is not None:
            g.current_user = _serialize_user(supabase_user)
            return fn(*args, **kwargs)

        try:
            user = auth_service.verify_access_token(token)
        except AuthError as exc:
            return jsonify({"error": str(exc)}), 401

        g.current_user = _serialize_user(user)
        return fn(*args, **kwargs)

    return wrapper
