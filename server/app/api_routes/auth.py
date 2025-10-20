from flask import Blueprint, request, jsonify
from app.services.auth_service import AuthService

bp = Blueprint("auth", __name__)
auth_service = AuthService()


@bp.route("/login", methods=["POST"])
def login():
    """User login"""
    try:
        data = request.get_json()
        username = data.get("username")
        password = data.get("password")

        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400

        result = auth_service.authenticate_user(username, password)

        if result["success"]:
            return jsonify(
                {
                    "message": "Login successful",
                    "user": result["user"],
                    "token": result["token"],
                }
            )
        else:
            return jsonify({"error": result["error"]}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/register", methods=["POST"])
def register():
    """User registration"""
    try:
        data = request.get_json()
        username = data.get("username")
        email = data.get("email")
        password = data.get("password")

        if not all([username, email, password]):
            return jsonify({"error": "Username, email, and password are required"}), 400

        result = auth_service.register_user(username, email, password)

        if result["success"]:
            return (
                jsonify({"message": "Registration successful", "user": result["user"]}),
                201,
            )
        else:
            return jsonify({"error": result["error"]}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/logout", methods=["POST"])
def logout():
    """User logout"""
    try:
        # In a real implementation, you would invalidate the token
        return jsonify({"message": "Logout successful"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
