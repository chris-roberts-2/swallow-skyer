import io
from types import SimpleNamespace

def test_project_scoped_photo_listing(monkeypatch, client, auth_headers):
    called = {}
    project_id = "11111111-1111-1111-1111-111111111111"

    monkeypatch.setattr(
        "app.api_routes.v1.photos.supabase_client.get_project_role",
        lambda project_id, user_id: "Viewer",
    )
    def mock_fetch_project_photos(project_ids, **kwargs):
        called["project_ids"] = project_ids
        return {"data": [], "count": 0}

    monkeypatch.setattr(
        "app.api_routes.v1.photos.supabase_client.fetch_project_photos",
        mock_fetch_project_photos,
    )

    resp = client.get(
        f"/api/v1/photos/?project_id={project_id}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert called["project_ids"] == [project_id]


def test_project_id_required(monkeypatch, client, auth_headers):
    resp = client.get("/api/v1/photos/", headers=auth_headers)
    assert resp.status_code == 400
    assert resp.get_json().get("error") == "project_id is required"


def test_project_scoped_photo_listing_forbidden(monkeypatch, client, auth_headers):
    monkeypatch.setattr(
        "app.api_routes.v1.photos.supabase_client.get_project_role",
        lambda project_id, user_id: None,
    )
    resp = client.get(
        "/api/v1/photos/?project_id=11111111-1111-1111-1111-111111111111",
        headers=auth_headers,
    )
    assert resp.status_code == 403
    assert resp.get_json().get("error") == "forbidden"

