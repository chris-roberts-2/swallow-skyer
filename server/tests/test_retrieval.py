from types import SimpleNamespace

import pytest


@pytest.fixture
def auth_client(client, auth_headers):
    """Helper fixture that yields client + default auth headers."""
    return client, auth_headers


def test_photo_listing_returns_signed_urls_and_pagination(auth_client, monkeypatch):
    client, headers = auth_client
    from app.services.storage import supabase_client as supabase_module
    from app.services.storage import r2_client as r2_module

    monkeypatch.setattr(
        supabase_module.supabase_client, "client", SimpleNamespace(name="mock_sb")
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "owner",
        raising=True,
    )

    captured_args = {}

    def mock_fetch_project_photos(**kwargs):
        captured_args.update(kwargs)
        return {
            "data": [
                {
                    "id": "p1",
                    "project_id": "11111111-1111-1111-1111-111111111111",
                    "user_id": "user-123",
                    "file_name": "one.jpg",
                    "caption": None,
                    "latitude": 10.0,
                    "longitude": 20.0,
                    "created_at": "2024-01-01T00:00:00Z",
                    "captured_at": "2023-12-31T23:59:59Z",
                    "r2_path": "projects/11111111-1111-1111-1111-111111111111/photos/p1.jpg",
                    "r2_url": "",
                    "thumbnail_r2_path": "projects/11111111-1111-1111-1111-111111111111/photos/p1_thumb.jpg",
                    "thumbnail_r2_url": "",
                }
            ],
            "count": 42,
        }

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "fetch_project_photos",
        mock_fetch_project_photos,
        raising=True,
    )

    def mock_resolve_url(key, require_signed=False, expires_in=600):
        return f"https://signed.example/{key}"

    monkeypatch.setattr(
        r2_module.r2_client, "resolve_url", mock_resolve_url, raising=True
    )

    resp = client.get(
        "/api/v1/photos/?project_id=11111111-1111-1111-1111-111111111111&page=2&page_size=5",
        headers=headers,
    )

    assert resp.status_code == 200, resp.data
    data = resp.get_json()
    assert data["pagination"]["page"] == 2
    assert data["pagination"]["page_size"] == 5
    assert data["pagination"]["total"] == 42
    assert captured_args["project_ids"] == ["11111111-1111-1111-1111-111111111111"]
    assert captured_args["page"] == 2
    assert captured_args["page_size"] == 5

    photo = data["photos"][0]
    assert photo["url"].startswith(
        "https://signed.example/projects/11111111-1111-1111-1111-111111111111/photos/p1.jpg"
    )
    assert (
        photo["r2_path"]
        == "projects/11111111-1111-1111-1111-111111111111/photos/p1.jpg"
    )
    assert (
        photo["thumbnail_r2_path"]
        == "projects/11111111-1111-1111-1111-111111111111/photos/p1_thumb.jpg"
    )
    assert photo["thumbnail_url"].startswith(
        "https://signed.example/projects/11111111-1111-1111-1111-111111111111/photos/p1_thumb.jpg"
    )
    assert photo["project_role"] == "owner"


def test_photo_listing_requires_membership_for_requested_project(
    auth_client, monkeypatch
):
    client, headers = auth_client
    from app.services.storage import supabase_client as supabase_module

    monkeypatch.setattr(
        supabase_module.supabase_client, "client", SimpleNamespace(name="mock_sb")
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: None,
        raising=True,
    )

    resp = client.get(
        "/api/v1/photos/?project_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        headers=headers,
    )

    assert resp.status_code == 403
    assert resp.get_json().get("error") == "forbidden"


def test_photo_listing_filters_user_and_date_range(auth_client, monkeypatch):
    client, headers = auth_client
    from app.services.storage import supabase_client as supabase_module

    monkeypatch.setattr(
        supabase_module.supabase_client, "client", SimpleNamespace(name="mock_sb")
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "owner",
        raising=True,
    )

    captured = {}

    def mock_fetch_project_photos(**kwargs):
        captured.update(kwargs)
        return {
            "data": [
                {
                    "id": "meta-photo",
                    "project_id": "proj-1",
                    "r2_path": "projects/proj-1/photos/meta-photo.jpg",
                    "r2_url": "https://cdn/meta-photo.jpg",
                    "metadata": {
                        "thumbnails": {
                            "default": {
                                "r2_path": "projects/proj-1/photos/meta-photo_thumb.jpg",
                                "r2_url": "https://cdn/meta-photo_thumb.jpg",
                            }
                        }
                    },
                }
            ],
            "count": 1,
        }

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "fetch_project_photos",
        mock_fetch_project_photos,
        raising=True,
    )

    resp = client.get(
        "/api/v1/photos/?project_id=11111111-1111-1111-1111-111111111111&user_id=user-999&date_range=2024-01-01,2024-02-01",
        headers=headers,
    )

    assert resp.status_code == 200
    assert captured["user_id"] == "user-999"
    assert captured["date_range"] == ("2024-01-01", "2024-02-01")
    payload = resp.get_json()
    assert payload["photos"][0]["thumbnail_url"] == "https://cdn/meta-photo_thumb.jpg"

