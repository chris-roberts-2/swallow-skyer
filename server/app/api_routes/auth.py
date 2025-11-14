from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth_service import AuthError, AuthService

bp = Blueprint("auth", __name__)
auth_service = AuthService()


@bp.route("/signup", methods=["POST"])
def signup():
    """Create a user account."""
    data = request.get_json() or {}
    try:
        result = auth_service.signup(
            email=data.get("email"),
            password=data.get("password"),
            name=data.get("name"),
        )
    except AuthError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify(result), 201


@bp.route("/login", methods=["POST"])
def login():
    """Authenticate a user and issue tokens."""
    data = request.get_json() or {}
    try:
        result = auth_service.login(
            email=data.get("email"), password=data.get("password")
        )
    except AuthError as exc:
        return jsonify({"error": str(exc)}), 401
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify(result)


@bp.route("/refresh", methods=["POST"])
def refresh():
    """Exchange a refresh token for new tokens (rotation enforced)."""
    data = request.get_json() or {}
    refresh_token = data.get("refresh_token")
    if not refresh_token:
        return jsonify({"error": "refresh_token is required"}), 400

    try:
        result = auth_service.refresh_tokens(refresh_token)
    except AuthError as exc:
        return jsonify({"error": str(exc)}), 401
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify(result)


@bp.route("/me", methods=["GET"])
@jwt_required
def me():
    """Return the authenticated user profile."""
    return jsonify({"user": g.current_user.to_dict()})
