from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.storage.supabase_client import supabase_client

bp = Blueprint("profile_v1", __name__)


def _current_user_id() -> str:
    user = getattr(g, "current_user", None) or {}
    user_id = user.get("id") or user.get("sub")
    return str(user_id) if user_id else ""


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


