from flask import g

from app.services.auth.permissions import require_role


def test_owner_access_allows(app, monkeypatch):
    with app.app_context():
        g.current_user = {"id": "user-owner"}
        monkeypatch.setattr(
            "app.services.auth.permissions.supabase_client.get_project_role",
            lambda project_id, user_id: "Owner",
        )
        result = require_role("project-123", {"Owner", "Administrator"})
        assert isinstance(result, dict)
        assert result["user_id"] == "user-owner"
        assert result["role"] == "Owner"


def test_editor_restricted_access(app, monkeypatch):
    with app.app_context():
        g.current_user = {"id": "user-collab"}
        monkeypatch.setattr(
            "app.services.auth.permissions.supabase_client.get_project_role",
            lambda project_id, user_id: "Editor",
        )
        payload, status = require_role("project-123", {"Owner"})
        assert status == 403
        assert payload["error"] == "forbidden"


def test_viewer_read_only(app, monkeypatch):
    with app.app_context():
        g.current_user = {"id": "user-viewer"}
        monkeypatch.setattr(
            "app.services.auth.permissions.supabase_client.get_project_role",
            lambda project_id, user_id: "Viewer",
        )
        payload, status = require_role("project-123", {"Editor", "Owner"})
        assert status == 403
        assert payload["error"] == "forbidden"

