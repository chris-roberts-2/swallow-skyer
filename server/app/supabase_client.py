"""
Centralized Supabase client initialization and JWT utilities.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from supabase import Client, create_client

_service_role_client: Optional[Client] = None
_anon_client: Optional[Client] = None


def _get_supabase_url() -> str:
    return (os.getenv("SUPABASE_URL") or "").strip()


def _build_client(api_key: str) -> Optional[Client]:
    url = _get_supabase_url()
    key = (api_key or "").strip()
    if not url or not key:
        return None
    return create_client(url, key)


def get_service_role_client(refresh: bool = False) -> Optional[Client]:
    """
    Return a cached Supabase client configured with the service role key.
    """
    global _service_role_client

    if refresh:
        _service_role_client = None

    if _service_role_client is not None:
        return _service_role_client

    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv(
        "SUPABASE_SERVICE_KEY"
    )
    _service_role_client = _build_client(service_key or "")
    return _service_role_client


def get_anon_supabase_client(refresh: bool = False) -> Optional[Client]:
    """
    Return a cached Supabase client configured with the anon key.
    """
    global _anon_client

    if refresh:
        _anon_client = None

    if _anon_client is not None:
        return _anon_client

    anon_key = os.getenv("SUPABASE_ANON_KEY")
    _anon_client = _build_client(anon_key or "")
    return _anon_client


def reset_supabase_clients() -> None:
    """
    Clear cached client instances. Primarily used by tests.
    """
    global _service_role_client, _anon_client
    _service_role_client = None
    _anon_client = None


def verify_supabase_jwt(access_token: str) -> Dict[str, Any]:
    """
    Validate a Supabase JWT by delegating to Supabase Auth.

    Args:
        access_token: JWT obtained from the frontend/session.

    Returns:
        Dict containing the Supabase user metadata.

    Raises:
        ValueError: if the token is missing.
        RuntimeError: if the Supabase client is not configured.
        PermissionError: if validation fails.
    """
    token = (access_token or "").strip()
    if not token:
        raise ValueError("Supabase access token is required")

    client = get_service_role_client()
    if not client:
        # Service role key is preferred, but anon key is sufficient for calling
        # the Auth API to resolve a user from an access token.
        client = get_anon_supabase_client()
    if not client:
        raise RuntimeError(
            "Supabase client is not configured (set SUPABASE_URL and SUPABASE_ANON_KEY "
            "or SUPABASE_SERVICE_ROLE_KEY in server/.env.local or server/.env)"
        )

    try:
        response = client.auth.get_user(token)
    except (
        Exception
    ) as exc:  # pragma: no cover - supabase raises runtime-specific errors
        raise PermissionError("Supabase JWT validation failed") from exc

    user = getattr(response, "user", None) if response else None
    if user is None:
        raise PermissionError("Supabase JWT validation failed")

    if hasattr(user, "model_dump"):
        return user.model_dump()  # type: ignore[attr-defined]
    if hasattr(user, "dict"):
        return user.dict()  # type: ignore[attr-defined]
    if isinstance(user, dict):
        return user

    return {"user": user}
