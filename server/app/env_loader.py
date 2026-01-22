"""
Environment loading helpers.

Why this exists:
- Contributors sometimes place env vars in repo-root `.env(.local)` while the backend
  historically loads `server/.env(.local)`.
- When running from different working directories (or via a fresh venv), missing env
  files lead to confusing runtime errors ("Supabase client is not configured").

This module makes environment loading more resilient without overriding real shell env
vars (override=False).
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import List

from dotenv import load_dotenv


def _maybe_bootstrap_server_env(server_dir: Path) -> None:
    """
    If neither server/.env.local nor server/.env exists, copy server/.env.example to
    server/.env as a starting point.

    This does NOT fill secrets; it only prevents the "nothing exists" trap.
    """
    env_local = server_dir / ".env.local"
    env_file = server_dir / ".env"
    if env_local.exists() or env_file.exists():
        return

    template = server_dir / ".env.example"
    if not template.exists():
        return

    try:
        shutil.copyfile(template, env_file)
    except Exception:
        # Non-fatal: if bootstrap fails, we still try to load whatever exists.
        return

    # Helpful in local dev; safe because we do not print values.
    if os.environ.get("FLASK_DEBUG", "0") not in ("0", "false", "False"):
        print(
            "[env] Created server/.env from server/.env.example. "
            "Edit server/.env with real credentials, then restart the backend."
        )


def load_app_environment() -> List[str]:
    """
    Load environment variables from common locations (if present).

    Priority (first match wins because override=False):
    - server/.env.local
    - server/.env
    - repo-root/.env.local
    - repo-root/.env

    Returns:
        List of env file paths that were loaded (as strings).
    """
    app_dir = Path(__file__).resolve().parent  # server/app
    server_dir = app_dir.parent  # server
    repo_root = server_dir.parent

    _maybe_bootstrap_server_env(server_dir)

    candidates = [
        server_dir / ".env.local",
        server_dir / ".env",
        repo_root / ".env.local",
        repo_root / ".env",
    ]

    loaded: List[str] = []
    for env_path in candidates:
        if not env_path.exists():
            continue
        try:
            load_dotenv(env_path, override=False)
        except PermissionError:
            # Skip env files that aren't readable in locked-down environments.
            continue
        loaded.append(str(env_path))

    return loaded


