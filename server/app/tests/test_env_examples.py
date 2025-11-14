from pathlib import Path

SERVER_REQUIRED_KEYS = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
    "AUTH_ACCESS_SECRET",
    "AUTH_REFRESH_SECRET",
    "AUTH_JWT_ALGORITHM",
    "AUTH_ACCESS_TTL_SECONDS",
    "AUTH_REFRESH_TTL_SECONDS",
]

CLIENT_REQUIRED_KEYS = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_PUBLIC_BASE_URL",
    "REACT_APP_SUPABASE_URL",
    "REACT_APP_SUPABASE_ANON_KEY",
]


def _load_env_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, _ = line.partition("=")
            keys.add(key.strip())
    return keys


def test_client_and_server_env_examples_list_required_keys():
    repo_root = Path(__file__).resolve().parents[3]
    server_keys = _load_env_keys(repo_root / "server/.env.example")
    client_keys = _load_env_keys(repo_root / "client/.env.example")

    for key in SERVER_REQUIRED_KEYS:
        assert key in server_keys, f"{key} missing from server/.env.example"

    for key in CLIENT_REQUIRED_KEYS:
        assert key in client_keys, f"{key} missing from client/.env.example"

