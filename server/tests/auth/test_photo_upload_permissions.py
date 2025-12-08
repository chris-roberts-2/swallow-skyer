from io import BytesIO

import pytest

import app.api_routes.v1.photos as photos_module


class DummyPhoto:
    def to_dict(self):
        return {"id": "p1"}


@pytest.fixture
def upload_data():
    return {
        "file": (BytesIO(b"abc"), "one.jpg"),
        "latitude": "1.0",
        "longitude": "-1.0",
        "project_id": "proj-123",
    }


def test_upload_collaborator_allowed(client, auth_headers, monkeypatch, upload_data):
    monkeypatch.setattr(
        photos_module.supabase_client, "get_project_role", lambda pid, uid: "collaborator"
    )
    monkeypatch.setattr(
        photos_module, "validate_photo_data", lambda *args, **kwargs: {"valid": True}
    )
    monkeypatch.setattr(
        photos_module.photo_service, "process_upload", lambda **kwargs: DummyPhoto()
    )

    resp = client.post(
        "/api/v1/photos/upload",
        data=upload_data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 201
    assert resp.get_json()["photo"]["id"] == "p1"


def test_upload_viewer_forbidden(client, auth_headers, monkeypatch, upload_data):
    monkeypatch.setattr(
        photos_module.supabase_client, "get_project_role", lambda pid, uid: "viewer"
    )
    monkeypatch.setattr(
        photos_module, "validate_photo_data", lambda *args, **kwargs: {"valid": True}
    )

    resp = client.post(
        "/api/v1/photos/upload",
        data=upload_data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 403


def test_upload_missing_project_denied(client, auth_headers, monkeypatch, upload_data):
    monkeypatch.setattr(
        photos_module.supabase_client, "get_project_role", lambda pid, uid: "owner"
    )
    monkeypatch.setattr(
        photos_module, "validate_photo_data", lambda *args, **kwargs: {"valid": True}
    )
    bad_data = dict(upload_data)
    bad_data.pop("project_id", None)
    resp = client.post(
        "/api/v1/photos/upload",
        data=bad_data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 403
    assert resp.get_json().get("error") == "forbidden"


def test_upload_non_member_forbidden(client, auth_headers, monkeypatch, upload_data):
    monkeypatch.setattr(
        photos_module.supabase_client, "get_project_role", lambda pid, uid: None
    )
    monkeypatch.setattr(
        photos_module, "validate_photo_data", lambda *args, **kwargs: {"valid": True}
    )

    resp = client.post(
        "/api/v1/photos/upload",
        data=upload_data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 403
    assert resp.get_json().get("error") == "forbidden"

