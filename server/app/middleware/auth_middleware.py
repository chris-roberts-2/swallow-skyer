from functools import wraps

from flask import jsonify, g, request

from app.services.auth_service import AuthError, AuthService

auth_service = AuthService()


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

        try:
            user = auth_service.verify_access_token(token)
        except AuthError as exc:
            return jsonify({"error": str(exc)}), 401

        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper

