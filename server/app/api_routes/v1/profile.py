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

    When a placeholder user was created for this email (e.g. the user was
    invited to a project before they registered), this endpoint migrates all
    project memberships from the placeholder ID to the new authenticated user
    ID and removes the placeholder row. The same migration is also handled by
    the on_auth_user_created DB trigger, so this serves as a belt-and-suspenders
    fallback (both paths are idempotent).
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

        resolved_email = auth_email or email

        # Check for a pre-registered placeholder user with the same email.
        # The DB trigger (on_auth_user_created) may have already handled this;
        # if so, get_user_by_email returns the current user and no migration
        # is needed.
        existing = supabase_client.get_user_by_email(resolved_email)
        old_user_id = existing.get("id") if existing and existing.get("id") != user_id else None

        if old_user_id:
            # Temporarily rename the placeholder's email to free the unique
            # constraint so we can insert the authenticated user row.
            supabase_client.client.table("users").update(  # type: ignore[union-attr]
                {"email": f"__migrating__{old_user_id}"}
            ).eq("id", old_user_id).execute()

        # Upsert the authenticated user — must happen BEFORE updating
        # project_members so the FK constraint is satisfied.
        updates = {
            "id": user_id,
            "email": resolved_email,
            "first_name": first_name or None,
            "last_name": last_name or None,
            "company": company or None,
        }
        supabase_client.client.table("users").upsert(updates).execute()  # type: ignore[union-attr]

        if old_user_id:
            # Re-assign project memberships from the placeholder to the real user.
            supabase_client.client.table("project_members").update(  # type: ignore[union-attr]
                {"user_id": user_id}
            ).eq("user_id", old_user_id).execute()

            # Remove the now-orphaned placeholder row.
            supabase_client.client.table("users").delete().eq(  # type: ignore[union-attr]
                "id", old_user_id
            ).execute()

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


