import io
from types import SimpleNamespace

def test_project_scoped_photo_listing(monkeypatch, client, auth_headers):
    called = {}

    monkeypatch.setattr(
        "app.api_routes.v1.photos.supabase_client.list_projects_for_user",
        lambda user_id: [{"id": "proj-1", "role": "viewer"}],
    )
    monkeypatch.setattr(
        "app.api_routes.v1.photos.supabase_client.fetch_project_photos",
        lambda project_ids, **kwargs: called.setdefault("project_ids", project_ids)
        or {"data": [], "count": 0},
    )

    resp = client.get("/api/v1/photos?project_id=proj-1", headers=auth_headers)
    assert resp.status_code == 200
    assert called["project_ids"] == ["proj-1"]


def test_project_scoped_photo_listing_forbidden(monkeypatch, client, auth_headers):
    monkeypatch.setattr(
        "app.api_routes.v1.photos.supabase_client.get_project_role",
        lambda project_id, user_id: None,
    )
    resp = client.get("/api/v1/photos?project_id=proj-deny", headers=auth_headers)
    assert resp.status_code == 403
    assert resp.get_json().get("error") == "forbidden"

