import pytest
from types import SimpleNamespace


def test_date_filter(monkeypatch, client, auth_headers):
    from app.services.storage import supabase_client as supabase_module
    from app.services.storage import r2_client as r2_module

    supabase_module.supabase_client.client = SimpleNamespace(name="mock_sb")
    monkeypatch.setattr(
        r2_module.r2_client, "resolve_url", lambda key: f"https://cdn/{key}", raising=True
    )

    captured = {}

    def mock_fetch_project_photos(**kwargs):
        captured.update(kwargs)
        return {
            "data": [
                {
                    "id": "p1",
                    "project_id": "proj-1",
                    "r2_path": "projects/proj-1/photos/p1.jpg",
                    "r2_url": "https://cdn/p1.jpg",
                    "created_at": "2024-01-02T00:00:00Z",
                }
            ],
            "count": 1,
        }

    def mock_list_projects_for_user(user_id):
        return [{"id": "proj-1", "role": "owner"}]

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "list_projects_for_user",
        mock_list_projects_for_user,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "fetch_project_photos",
        mock_fetch_project_photos,
        raising=True,
    )

    resp = client.get(
        "/api/v1/photos/?start_date=2024-01-01&end_date=2024-01-31",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert captured["date_range"] == ("2024-01-01", "2024-01-31")
    data = resp.get_json()
    assert data["pagination"]["total"] == 1


def test_bbox_filter(monkeypatch, client, auth_headers):
    from app.services.storage import supabase_client as supabase_module
    from app.services.storage import r2_client as r2_module

    supabase_module.supabase_client.client = SimpleNamespace(name="mock_sb")
    monkeypatch.setattr(
        r2_module.r2_client, "resolve_url", lambda key: f"https://cdn/{key}", raising=True
    )

    captured = {}

    def mock_fetch_project_photos(**kwargs):
        captured.update(kwargs)
        return {"data": [], "count": 0}

    def mock_list_projects_for_user(user_id):
        return [{"id": "proj-1", "role": "owner"}]

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "list_projects_for_user",
        mock_list_projects_for_user,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "fetch_project_photos",
        mock_fetch_project_photos,
        raising=True,
    )

    resp = client.get(
        "/api/v1/photos/?min_lat=10&max_lat=20&min_lon=-50&max_lon=-40",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert captured["bbox"] == (10.0, 20.0, -50.0, -40.0)


def test_geocode_filter(monkeypatch, client, auth_headers):
    from app.services.storage import supabase_client as supabase_module
    from app.services.storage import r2_client as r2_module

    supabase_module.supabase_client.client = SimpleNamespace(name="mock_sb")
    monkeypatch.setattr(
        r2_module.r2_client, "resolve_url", lambda key: f"https://cdn/{key}", raising=True
    )

    captured = {}

    def mock_fetch_project_photos(**kwargs):
        captured.update(kwargs)
        return {"data": [], "count": 0}

    def mock_list_projects_for_user(user_id):
        return [{"id": "proj-1", "role": "owner"}]

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "list_projects_for_user",
        mock_list_projects_for_user,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "fetch_project_photos",
        mock_fetch_project_photos,
        raising=True,
    )

    resp = client.get(
        "/api/v1/photos/?city=Paris&state=Ile&country=France",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert captured["city"] == "Paris"
    assert captured["state"] == "Ile"
    assert captured["country"] == "France"

