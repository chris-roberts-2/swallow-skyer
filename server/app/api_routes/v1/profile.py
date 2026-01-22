from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.storage.supabase_client import supabase_client

bp = Blueprint("profile_v1", __name__)


def _current_user_id() -> str:
    user = getattr(g, "current_user", None) or {}
    user_id = user.get("id") or user.get("sub")
    return str(user_id) if user_id else ""


def _clean_text(value: str) -> str:
    return (value or "").strip()


def _normalize_email(value: str) -> str:
    return _clean_text(value).lower()


@bp.route("", methods=["GET"])
@jwt_required
def get_profile():
    """
    Return the authenticated user's profile row from Supabase public.users.

    We use the backend service-role Supabase client so the frontend does not need
    direct access to public.users (and is not blocked by RLS policies).
    """
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401

    email = (getattr(g, "current_user", None) or {}).get("email")

    try:
        row = supabase_client.get_user_metadata(user_id) or None
        if not row:
            supabase_client.ensure_user_exists(user_id, email=email)
            row = supabase_client.get_user_metadata(user_id) or None
        return jsonify({"profile": row}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/register", methods=["POST"])
def register_profile():
    """
    Store user metadata in Supabase public.users immediately after signup.

    This endpoint is intentionally unauthenticated because Supabase may require
    email confirmation before a session exists.
    """
    payload = request.get_json(silent=True) or {}
    user_id = _clean_text(payload.get("userId") or payload.get("id") or "")
    email = _normalize_email(payload.get("email") or "")
    if not user_id:
        return jsonify({"error": "userId is required"}), 400
    if not email:
        return jsonify({"error": "email is required"}), 400

    first_name = _clean_text(payload.get("first_name") or payload.get("firstName") or "")
    last_name = _clean_text(payload.get("last_name") or payload.get("lastName") or "")
    company = _clean_text(payload.get("company") or "")

    try:
        auth_user = supabase_client.get_auth_user_by_id(user_id)
        auth_email = _normalize_email(auth_user.get("email") or "")
        if auth_email and auth_email != email:
            return jsonify({"error": "Email does not match Supabase auth user"}), 400

        updates = {
            "id": user_id,
            "email": auth_email or email,
            "first_name": first_name or None,
            "last_name": last_name or None,
            "company": company or None,
        }
        supabase_client.client.table("users").upsert(updates).execute()  # type: ignore[union-attr]
        row = supabase_client.get_user_metadata(user_id)
        return jsonify({"profile": row}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("", methods=["PATCH"])
@jwt_required
def update_profile():
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401

    payload = request.get_json(silent=True) or {}
    updates = {}
    for key in ("first_name", "last_name", "company", "email"):
        if key in payload:
            updates[key] = payload.get(key)

    if not updates:
        return jsonify({"error": "No profile fields provided"}), 400

    try:
        updates["id"] = user_id
        # supabase-py v2 does not support chaining .select() after .upsert() the way
        # postgrest-js does. Execute the upsert, then read the row back.
        supabase_client.client.table("users").upsert(updates).execute()  # type: ignore[union-attr]
        row = supabase_client.get_user_metadata(user_id)
        return jsonify({"profile": row}), 200
    except Exception as exc:
        message = str(exc)
        # If Supabase PostgREST schema cache is missing columns (common when migrations
        # haven't been applied), surface a clear, actionable error.
        if "PGRST204" in message and "Could not find the" in message:
            return (
                jsonify(
                    {
                        "error": "Supabase schema is missing required profile columns on public.users",
                        "code": "SUPABASE_SCHEMA_MISSING_COLUMNS",
                        "details": message,
                        "requiredColumns": ["first_name", "last_name", "company"],
                        "fix": "Apply the migration that adds profile columns (see supabase/migrations/20251216000000_add_user_profile_fields.sql) and refresh PostgREST schema cache.",
                    }
                ),
                500,
            )
        return jsonify({"error": message}), 500


