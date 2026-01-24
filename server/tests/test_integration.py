import io
import json
import os
from types import SimpleNamespace

import pytest
from PIL import Image


def create_test_app():
    from app import create_app

    app = create_app("testing")
    app.config.update(
        {
            "TESTING": True,
        }
    )
    return app


@pytest.fixture()
def app():
    return create_test_app()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_image_bytes() -> bytes:
    img = Image.new("RGB", (32, 32), color=(120, 120, 220))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_upload_save_retrieve_flow(client, monkeypatch, auth_headers):
    # Arrange: mock R2 client upload and URL generation
    project_uuid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    stored_calls = {
        "r2_upload": [],
        "r2_upload_thumb": [],
        "r2_get_url": [],
        "supabase_store": [],
        "supabase_update": [],
        "supabase_fetch": [],
    }

    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module
    import app.routes.upload as upload_module

    # Ensure clients appear initialized even without real credentials
    monkeypatch.setattr(
        r2_module.r2_client, "client", SimpleNamespace(name="mock_s3"), raising=True
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "client",
        SimpleNamespace(name="mock_supabase"),
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )
    monkeypatch.setattr(
        upload_module,
        "require_role",
        lambda project_id, roles: {"user_id": "user-42"},
        raising=True,
    )

    def mock_upload_project_photo(project_id, photo_id, file_bytes, ext, content_type=None):
        key = f"projects/{project_id}/photos/{photo_id}.{ext}"
        stored_calls["r2_upload"].append({"key": key, "content_type": content_type})
        return key

    def mock_upload_thumbnail(data, key, content_type=None):
        stored_calls["r2_upload_thumb"].append(
            {"key": key, "content_type": content_type}
        )
        return True

    def mock_get_file_url(key):
        stored_calls["r2_get_url"].append({"key": key})
        return f"https://mock.cdn.example/{key}"

    monkeypatch.setattr(
        r2_module.r2_client, "upload_project_photo", mock_upload_project_photo, raising=True
    )
    monkeypatch.setattr(
        r2_module.r2_client, "upload_bytes", mock_upload_thumbnail, raising=True
    )
    monkeypatch.setattr(
        r2_module.r2_client, "get_file_url", mock_get_file_url, raising=True
    )

    # Supabase: store returns a record including an id; list returns our record
    created_record = {
        "id": "photo-123",
        "user_id": "user-42",
        "project_id": project_uuid,
        "r2_key": None,  # will be filled after upload
        "url": None,  # will be filled after upload
        "latitude": 37.7749,
        "longitude": -122.4194,
        "taken_at": "2024-01-01T00:00:00Z",
    }

    def mock_store_photo_metadata(photo_data):
        stored_calls["supabase_store"].append(photo_data)
        # Echo back what API would persist
        created = dict(created_record)
        created.update(photo_data)
        if not created.get("id"):
            created["id"] = "photo-123"
        stored_calls["placeholder_result"] = created
        return created

    def mock_update_photo_metadata(photo_id, updates):
        stored_calls["supabase_update"].append(
            {"photo_id": photo_id, "updates": updates}
        )
        updated = dict(created_record)
        updated.update(updates)
        updated["id"] = photo_id
        return updated

    def mock_list_projects_for_user(user_id, show_on_projects=True):
        return [{"id": project_uuid, "role": "Owner"}]

    def mock_fetch_project_photos(**kwargs):
        stored_calls["supabase_fetch"].append(kwargs)
        return {
            "data": [
                {
                    **created_record,
                    "r2_path": f"projects/{project_uuid}/photos/{created_record['id']}.jpg",
                    "r2_url": None,
                    "thumbnail_r2_path": f"projects/{project_uuid}/photos/{created_record['id']}_thumb.jpg",
                    "thumbnail_r2_url": None,
                }
            ],
            "count": 1,
        }

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "store_photo_metadata",
        mock_store_photo_metadata,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_photo_metadata",
        mock_update_photo_metadata,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "list_projects_for_user",
        mock_list_projects_for_user,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Owner",
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "fetch_project_photos",
        mock_fetch_project_photos,
        raising=True,
    )

    # Act: upload a mock image
    img_bytes = _make_image_bytes()
    data = {
        "file": (io.BytesIO(img_bytes), "sample.jpg", "image/jpeg"),
        "user_id": "user-42",
        "latitude": "37.7749",
        "longitude": "-122.4194",
        "timestamp": "2024-01-01T00:00:00Z",
        "project_id": project_uuid,
    }

    upload_resp = client.post(
        "/api/photos/upload",
        data=data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )

    # Assert: upload result
    assert upload_resp.status_code == 201, (upload_resp.data, stored_calls)
    upload_json = upload_resp.get_json()
    assert upload_json["status"] == "success"
    uploaded_item = upload_json["uploaded"][0]
    assert uploaded_item.get("photo_id") == "photo-123"
    assert uploaded_item.get("r2_url") and uploaded_item["r2_url"].startswith(
        "https://mock.cdn.example/"
    )

    # Verify interactions with R2 and Supabase during upload
    assert stored_calls["r2_upload"], "Expected R2 upload to be called"
    assert stored_calls["r2_get_url"], "Expected R2 get_file_url to be called"
    assert stored_calls[
        "supabase_store"
    ], "Expected Supabase store_photo_metadata to be called"

    stored_record = stored_calls["supabase_store"][0]
    assert stored_record["latitude"] == pytest.approx(37.7749)
    assert stored_record["longitude"] == pytest.approx(-122.4194)
    assert stored_record.get("captured_at") == "2024-01-01T00:00:00Z"
    assert stored_record.get("project_id") == project_uuid
    assert "r2_path" not in stored_record

    updated_payload = stored_calls["supabase_update"][0]
    assert updated_payload["photo_id"] == "photo-123"
    assert updated_payload["updates"]["r2_path"].startswith(
        f"projects/{project_uuid}/photos/"
    )
    assert stored_calls["r2_upload_thumb"], "Expected thumbnail upload to be called"
    assert updated_payload["updates"]["thumbnail_r2_path"].endswith("_thumb.jpg")

    # Act: retrieve photos
    list_resp = client.get(
        f"/api/v1/photos/?project_id={project_uuid}",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200, list_resp.data
    list_json = list_resp.get_json()
    photos = list_json.get("photos", [])
    assert len(photos) == 1
    photo = photos[0]

    # Assert: retrieval matches metadata
    assert photo.get("id") == "photo-123"
    assert photo.get("url") and photo["url"].startswith("https://mock.cdn.example/")
    assert photo.get("latitude") == pytest.approx(37.7749)
    assert photo.get("longitude") == pytest.approx(-122.4194)
    assert photo.get("thumbnail_r2_path").endswith("_thumb.jpg")
    assert photo.get("thumbnail_url").startswith("https://mock.cdn.example/")


def test_photo_listing_enforces_project_membership(client, monkeypatch, auth_headers):
    from app.services.storage import supabase_client as supabase_module

    monkeypatch.setattr(
        supabase_module.supabase_client, "client", SimpleNamespace(name="mock_sb")
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: None,
        raising=True,
    )

    resp = client.get(
        "/api/v1/photos/?project_id=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        headers=auth_headers,
    )

    assert resp.status_code == 403
