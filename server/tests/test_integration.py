import io
import json
import os
from types import SimpleNamespace

import pytest


def create_test_app():
    from app import create_app

    app = create_app("testing")
    app.config.update(
        {"TESTING": True,}
    )
    return app


@pytest.fixture()
def app():
    return create_test_app()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_image_bytes() -> bytes:
    # Minimal JPEG header + padding, sufficient for mimetype=image/jpeg in tests
    return b"\xff\xd8\xff\xe0" + b"0" * 1024 + b"\xff\xd9"


def test_upload_save_retrieve_flow(client, monkeypatch):
    # Arrange: mock R2 client upload and URL generation
    stored_calls = {
        "r2_upload": [],
        "r2_get_url": [],
        "supabase_store": [],
        "supabase_get": [],
    }

    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module

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

    def mock_upload_file(fileobj, key):
        stored_calls["r2_upload"].append({"key": key})
        # Consume file-like to mimic real behavior
        _ = fileobj.read()
        return True

    def mock_get_file_url(key):
        stored_calls["r2_get_url"].append({"key": key})
        return f"https://mock.cdn.example/{key}"

    monkeypatch.setattr(
        r2_module.r2_client, "upload_file", mock_upload_file, raising=True
    )
    monkeypatch.setattr(
        r2_module.r2_client, "get_file_url", mock_get_file_url, raising=True
    )

    # Supabase: store returns a record including an id; list returns our record
    created_record = {
        "id": "photo-123",
        "user_id": "user-42",
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
        return created

    def mock_get_photos(limit=None, offset=None, since=None, bbox=None, user_id=None):
        stored_calls["supabase_get"].append(
            {
                "limit": limit,
                "offset": offset,
                "since": since,
                "bbox": bbox,
                "user_id": user_id,
            }
        )
        return {
            "data": [
                {
                    **created_record,
                    "url": created_record["url"]
                    or "https://mock.cdn.example/uploads/anonymous/abc.jpg",
                    "r2_key": created_record["r2_key"] or "uploads/anonymous/abc.jpg",
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
        supabase_module.supabase_client, "get_photos", mock_get_photos, raising=True
    )

    # Act: upload a mock image
    img_bytes = _make_image_bytes()
    data = {
        "file": (io.BytesIO(img_bytes), "sample.jpg", "image/jpeg"),
        "user_id": "user-42",
        "latitude": "37.7749",
        "longitude": "-122.4194",
        "timestamp": "2024-01-01T00:00:00Z",
    }

    upload_resp = client.post(
        "/api/photos/upload", data=data, content_type="multipart/form-data",
    )

    # Assert: upload result
    assert upload_resp.status_code == 201, upload_resp.data
    upload_json = upload_resp.get_json()
    assert upload_json["status"] == "success"
    assert upload_json.get("photo_id") == "photo-123"
    assert upload_json.get("url") and upload_json["url"].startswith(
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
    assert stored_record.get("taken_at") == "2024-01-01T00:00:00Z"

    # Act: retrieve photos
    list_resp = client.get("/api/photos")
    assert list_resp.status_code == 200
    list_json = list_resp.get_json()
    photos = list_json.get("photos", [])
    assert len(photos) == 1
    photo = photos[0]

    # Assert: retrieval matches metadata
    assert photo.get("id") == "photo-123"
    assert photo.get("url") and photo["url"].startswith("https://mock.cdn.example/")
    assert photo.get("latitude") == pytest.approx(37.7749)
    assert photo.get("longitude") == pytest.approx(-122.4194)
