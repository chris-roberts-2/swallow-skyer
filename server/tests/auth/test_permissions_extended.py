import pytest

from app.services.auth.permissions import require_role


def test_require_role_missing_project():
    payload, status = require_role(None, {"owner"})
    assert status == 403
    assert payload["error"] == "forbidden"


def test_require_role_forbidden(monkeypatch):
    monkeypatch.setattr(
        "app.services.auth.permissions.supabase_client.get_project_role",
        lambda project_id, user_id: None,
    )
    payload, status = require_role("proj-1", {"owner"}, user_id="user-1")
    assert status == 403
    assert payload["error"] == "forbidden"


@pytest.mark.parametrize("role", ["owner", "co-owner", "collaborator", "viewer"])
def test_require_role_allows_roles(monkeypatch, role):
    monkeypatch.setattr(
        "app.services.auth.permissions.supabase_client.get_project_role",
        lambda project_id, user_id: role,
    )
    result = require_role(
        "proj-1",
        {"owner", "co-owner", "collaborator", "viewer"},
        user_id="user-1",
    )
    assert isinstance(result, dict)
    assert result["role"] == role

