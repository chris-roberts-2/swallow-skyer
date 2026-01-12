from functools import wraps

from flask import jsonify, g, request

from app.supabase_client import SupabaseConfigError, verify_supabase_jwt
from app.services.storage.supabase_client import supabase_client


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
        except SupabaseConfigError as exc:
            # Server misconfiguration: without Supabase config we can't validate
            # Supabase access tokens, so falling back to our legacy JWT verifier
            # produces confusing "Invalid token" errors.
            return (
                jsonify(
                    {
                        "error": str(exc),
                        "code": "SUPABASE_NOT_CONFIGURED",
                        "missingEnv": getattr(exc, "missing_env_keys", []),
                    }
                ),
                503,
            )
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 500
        except (ValueError, PermissionError) as exc:
            return jsonify({"error": str(exc)}), 401

        if supabase_user is not None:
            resolved = _serialize_user(supabase_user) or {}
            auth_user_id = resolved.get("id") or resolved.get("sub")
            email = resolved.get("email")
            try:
                app_user = supabase_client.ensure_user_for_auth(
                    str(auth_user_id or "").strip(), email=email
                )
            except Exception as exc:
                return (
                    jsonify(
                        {
                            "error": f"Unable to resolve app user: {exc}",
                            "code": "USER_MAPPING_FAILED",
                        }
                    ),
                    500,
                )

            # Normalize to app user identity for downstream permissions and FK usage.
            g.current_user = {
                **resolved,
                "auth_user_id": str(auth_user_id or "").strip() or None,
                "app_user_id": app_user.get("id"),
                # Backwards-compatible: treat g.current_user.id as the app user id.
                "id": app_user.get("id"),
                "email": app_user.get("email") or email,
            }
            return fn(*args, **kwargs)

        # Supabase validation returned no user and did not raise a configuration error.
        # Treat as unauthorized. We intentionally do NOT fall back to any internal JWT
        # scheme to keep auth + user identity exclusively Supabase-backed.
        return jsonify({"error": "Invalid token"}), 401

    return wrapper
