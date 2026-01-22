import io
from types import SimpleNamespace
import pytest
from PIL import Image, ExifTags


def _make_image_with_exif():
    img = Image.new("RGB", (32, 32), color=(10, 20, 30))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_exif_parsing_and_location_creation(client, auth_headers, monkeypatch):
    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module
    import app.routes.upload as upload_module

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
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )
    monkeypatch.setattr(
        upload_module,
        "require_role",
        lambda project_id, roles: {"user_id": "user-1"},
        raising=True,
    )

    calls = {"locations": [], "stores": [], "updates": []}

    def mock_get_or_create_location(lat, lon, elevation=None):
        calls["locations"].append((lat, lon, elevation))
        return "loc-123"

    def mock_store_photo_metadata(data):
        record = {"id": "photo-1", **data}
        calls["stores"].append(record)
        return record

    def mock_update_photo_metadata(photo_id, updates):
        calls["updates"].append({"photo_id": photo_id, "updates": updates})
        return {"id": photo_id, **updates}

    def mock_upload_project_photo(project_id, photo_id, file_bytes, ext, content_type=None):
        return f"projects/{project_id}/photos/{photo_id}.{ext}"

    def mock_upload_bytes(data, key, content_type=None):
        return True

    def mock_get_file_url(key):
        return f"https://cdn.example/{key}"

    # Force deterministic exif parsing result
    def mock_extract_exif_data(image, original_bytes):
        return (
            {"DateTimeOriginal": "2024:01:01 00:00:00", "gps": {}},
            "2024-01-01T00:00:00Z",
            {"lat": 10.5, "lon": -20.75},
        )

    monkeypatch.setattr(
        upload_module, "_extract_exif_data", mock_extract_exif_data, raising=True
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_or_create_location",
        mock_get_or_create_location,
        raising=True,
    )
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
        r2_module.r2_client,
        "upload_project_photo",
        mock_upload_project_photo,
        raising=True,
    )
    monkeypatch.setattr(
        r2_module.r2_client, "upload_bytes", mock_upload_bytes, raising=True
    )
    monkeypatch.setattr(
        r2_module.r2_client, "get_file_url", mock_get_file_url, raising=True
    )

    resp = client.post(
        "/api/photos/upload",
        data={
            "file": (io.BytesIO(_make_image_with_exif()), "exif.jpg", "image/jpeg"),
            "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        },
        headers=auth_headers,
        content_type="multipart/form-data",
    )

    assert resp.status_code == 201, resp.data
    assert calls["locations"] == [(10.5, -20.75, None)]
    assert calls["stores"][0]["location_id"] == "loc-123"
    assert calls["stores"][0]["exif_data"] is not None
    assert calls["stores"][0]["captured_at"] == "2024-01-01T00:00:00Z"


def test_batch_upload_uses_exif_and_locations(client, auth_headers, monkeypatch):
    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module
    import app.routes.upload as upload_module

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
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )
    monkeypatch.setattr(
        upload_module,
        "require_role",
        lambda project_id, roles: {"user_id": "user-1"},
        raising=True,
    )

    location_calls = []
    store_calls = []

    def mock_get_or_create_location(lat, lon, elevation=None):
        location_calls.append((lat, lon, elevation))
        return f"loc-{len(location_calls)}"

    def mock_store_photo_metadata(data):
        idx = len(store_calls) + 1
        record = {"id": f"photo-{idx}", **data}
        store_calls.append(record)
        return record

    def mock_update_photo_metadata(photo_id, updates):
        return {"id": photo_id, **updates}

    def mock_upload_project_photo(project_id, photo_id, file_bytes, ext, content_type=None):
        return f"projects/{project_id}/photos/{photo_id}.{ext}"

    monkeypatch.setattr(
        upload_module,
        "_extract_exif_data",
        lambda image, original_bytes: (
            {"DateTimeOriginal": "2024:01:01 00:00:00", "gps": {}},
            "2024-01-01T00:00:00Z",
            {"lat": 1.0, "lon": 2.0},
        ),
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_or_create_location",
        mock_get_or_create_location,
        raising=True,
    )
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
        r2_module.r2_client,
        "upload_project_photo",
        mock_upload_project_photo,
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

    resp = client.post(
        "/api/photos/upload",
        data={
            "files": [
                (io.BytesIO(_make_image_with_exif()), "one.jpg", "image/jpeg"),
                (io.BytesIO(_make_image_with_exif()), "two.jpg", "image/jpeg"),
            ],
            "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        },
        headers=auth_headers,
        content_type="multipart/form-data",
    )

    assert resp.status_code == 201, resp.data
    assert len(location_calls) == 2
    assert len(store_calls) == 2
    assert all(call[0] == 1.0 for call in location_calls)


def test_exif_reuses_location(client, auth_headers, monkeypatch):
    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module
    import app.routes.upload as upload_module

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
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )
    monkeypatch.setattr(
        upload_module,
        "require_role",
        lambda project_id, roles: {"user_id": "user-1"},
        raising=True,
    )

    location_calls = []

    def mock_get_or_create_location(lat, lon, elevation=None):
        location_calls.append((lat, lon))
        return "loc-existing"

    monkeypatch.setattr(
        upload_module,
        "_extract_exif_data",
        lambda image, original_bytes: (
            {"DateTimeOriginal": "2024:01:01 00:00:00", "gps": {}},
            "2024-01-01T00:00:00Z",
            {"lat": 10.0, "lon": -20.0},
        ),
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_or_create_location",
        mock_get_or_create_location,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "store_photo_metadata",
        lambda data: {"id": "photo-1", **data},
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_photo_metadata",
        lambda photo_id, updates: {"id": photo_id, **updates},
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

    resp = client.post(
        "/api/photos/upload",
        data={
          "file": (io.BytesIO(_make_image_with_exif()), "one.jpg", "image/jpeg"),
          "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        },
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 201
    # reused location once
    assert location_calls == [(10.0, -20.0)]

