from io import BytesIO

import pytest

import app.routes.upload as upload_module
from types import SimpleNamespace


class DummyPhoto:
    def to_dict(self):
        return {"id": "p1"}


@pytest.fixture
def upload_data():
    return {
        "file": (BytesIO(b"abc"), "one.jpg"),
        "project_id": "11111111-1111-1111-1111-111111111111",
    }


def test_upload_collaborator_allowed(client, auth_headers, monkeypatch, upload_data):
    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module

    monkeypatch.setattr(
        upload_module, "require_role", lambda project_id, roles: {"user_id": "user-1"}
    )
    monkeypatch.setattr(
        r2_module.r2_client, "client", SimpleNamespace(name="mock_r2"), raising=True
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "client",
        SimpleNamespace(name="mock_supabase"),
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "store_photo_metadata",
        lambda data: {"id": "p1", **data},
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_photo_metadata",
        lambda photo_id, updates: {"id": photo_id, **updates},
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )
    monkeypatch.setattr(
        r2_module.r2_client,
        "upload_project_photo",
        lambda project_id, photo_id, file_bytes, ext, content_type=None: f"projects/{project_id}/photos/{photo_id}.{ext}",
        raising=True,
    )
    monkeypatch.setattr(
        r2_module.r2_client,
        "upload_bytes",
        lambda data, key, content_type=None: True,
        raising=True,
    )
    monkeypatch.setattr(
        r2_module.r2_client,
        "get_file_url",
        lambda key: f"https://cdn/{key}",
        raising=True,
    )
    monkeypatch.setattr(
        upload_module,
        "_read_file_bytes",
        lambda file_item: b"abc",
        raising=True,
    )
    monkeypatch.setattr(
        upload_module,
        "_load_image",
        lambda data: object(),
        raising=True,
    )
    monkeypatch.setattr(
        upload_module,
        "_generate_thumbnail_bytes",
        lambda image, mime: (b"thumb", "jpg", "image/jpeg"),
        raising=True,
    )
    monkeypatch.setattr(
        upload_module,
        "_extract_exif_data",
        lambda image, original_bytes: ({}, None, None),
        raising=True,
    )

    resp = client.post(
        "/api/photos/upload",
        data=upload_data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 201
    assert resp.get_json()["uploaded"][0]["photo_id"] == "p1"


def test_upload_viewer_forbidden(client, auth_headers, monkeypatch, upload_data):
    monkeypatch.setattr(
        upload_module,
        "require_role",
        lambda project_id, roles: ({"error": "forbidden"}, 403),
    )

    resp = client.post(
        "/api/photos/upload",
        data=upload_data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 403


def test_upload_missing_project_denied(client, auth_headers, monkeypatch, upload_data):
    bad_data = dict(upload_data)
    bad_data.pop("project_id", None)
    resp = client.post(
        "/api/photos/upload",
        data=bad_data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 400
    assert resp.get_json().get("message") == "project_id is required"


def test_upload_non_member_forbidden(client, auth_headers, monkeypatch, upload_data):
    monkeypatch.setattr(
        upload_module,
        "require_role",
        lambda project_id, roles: ({"error": "forbidden"}, 403),
    )

    resp = client.post(
        "/api/photos/upload",
        data=upload_data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 403
    assert resp.get_json().get("error") == "forbidden"

