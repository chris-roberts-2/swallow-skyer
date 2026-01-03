import io
from types import SimpleNamespace

import pytest
from PIL import Image


def create_test_app():
    from app import create_app

    app = create_app("testing")
    app.config["TESTING"] = True
    return app


@pytest.fixture()
def app():
    return create_test_app()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_image_bytes():
    img = Image.new("RGB", (16, 16), color=(200, 50, 50))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_upload_stores_project_prefixed_key_and_updates_supabase(client, monkeypatch):
    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module

    monkeypatch.setattr(
        r2_module.r2_client, "client", SimpleNamespace(name="mock_r2"), raising=True
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "client",
        SimpleNamespace(name="mock_supabase"),
        raising=True,
    )

    captured = {
        "store": None,
        "upload_key": None,
        "update": None,
        "thumb_upload_key": None,
        "deleted_keys": [],
    }

    def mock_upload_project_photo(project_id, photo_id, file_bytes, ext, content_type=None):
        captured["upload_key"] = f"projects/{project_id}/photos/{photo_id}.{ext}"
        captured["content_type"] = content_type
        return captured["upload_key"]

    def mock_upload_bytes(data, key, content_type=None):
        captured["thumb_upload_key"] = key
        captured["thumb_content_type"] = content_type
        assert data, "thumbnail bytes should not be empty"
        return True

    def mock_get_file_url(key):
        return f"https://cdn.swallow.example/{key}"

    def mock_delete_file(key):
        captured["deleted_keys"].append(key)

    placeholder = {"id": "abc123"}

    def mock_store_photo_metadata(photo_data):
        captured["store"] = photo_data
        result = dict(placeholder)
        result.update(photo_data)
        return result

    def mock_update_photo_metadata(photo_id, updates):
        captured["update"] = {"photo_id": photo_id, "updates": updates}
        return {"id": photo_id, **updates}

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
    monkeypatch.setattr(
        r2_module.r2_client, "delete_file", mock_delete_file, raising=True
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
        supabase_module.supabase_client,
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )

    project_id = "11111111-1111-1111-1111-111111111111"
    img_bytes = _make_image_bytes()
    response = client.post(
        "/api/photos/upload",
        data={
            "file": (io.BytesIO(img_bytes), "Optimized.JPG", "image/jpeg"),
            "user_id": "user-99",
            "latitude": "41.12",
            "longitude": "-71.55",
            "project_id": project_id,
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 201, response.data
    payload = response.get_json()
    uploaded = payload["uploaded"][0]
    expected_key = f"projects/{project_id}/photos/abc123.jpg"
    assert uploaded["r2_path"] == expected_key
    assert captured["upload_key"] == expected_key
    assert captured["content_type"] == "image/jpeg"
    assert captured["store"]["project_id"] == project_id
    assert "r2_path" not in captured["store"]
    assert captured["update"]["updates"]["r2_path"] == expected_key
    assert captured["update"]["updates"]["r2_key"] == expected_key
    assert captured["update"]["updates"]["r2_url"].endswith(expected_key)
    expected_thumb = f"projects/{project_id}/photos/abc123_thumb.jpg"
    assert uploaded["thumbnail_r2_path"] == expected_thumb
    assert captured["thumb_upload_key"] == expected_thumb
    assert captured["thumb_content_type"] == "image/jpeg"
    assert captured["update"]["updates"]["thumbnail_r2_path"] == expected_thumb
    assert captured["update"]["updates"]["thumbnail_r2_url"].endswith("_thumb.jpg")


def test_thumbnail_upload_failure_triggers_cleanup(client, monkeypatch):
    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module

    monkeypatch.setattr(
        r2_module.r2_client, "client", SimpleNamespace(name="mock_r2"), raising=True
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "client",
        SimpleNamespace(name="mock_supabase"),
        raising=True,
    )

    deleted = []
    placeholder = {"id": "abc123"}

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "store_photo_metadata",
        lambda data: dict(placeholder, **data),
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )

    def mock_delete_photo(photo_id):
        deleted.append(photo_id)
        return True

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "delete_photo_metadata",
        mock_delete_photo,
        raising=True,
    )

    upload_keys = []

    def mock_upload_project_photo(project_id, photo_id, file_bytes, ext, content_type=None):
        upload_keys.append(f"projects/{project_id}/photos/{photo_id}.{ext}")
        return upload_keys[-1]

    def mock_upload_bytes(data, key, content_type=None):
        raise RuntimeError("boom")

    deleted_keys = []

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
        r2_module.r2_client,
        "get_file_url",
        lambda key: f"https://cdn/{key}",
        raising=True,
    )
    monkeypatch.setattr(
        r2_module.r2_client,
        "delete_file",
        lambda key: deleted_keys.append(key),
        raising=True,
    )

    response = client.post(
        "/api/photos/upload",
        data={
            "file": (io.BytesIO(_make_image_bytes()), "one.jpg", "image/jpeg"),
            "user_id": "user-42",
            "latitude": "1.0",
            "longitude": "2.0",
            "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 500
    assert deleted == ["abc123"]
    if upload_keys:
        assert set(deleted_keys) == set(upload_keys)


def test_update_failure_cleans_original_and_thumbnail(client, monkeypatch):
    from app.services.storage import r2_client as r2_module
    from app.services.storage import supabase_client as supabase_module

    monkeypatch.setattr(
        r2_module.r2_client, "client", SimpleNamespace(name="mock_r2"), raising=True
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "client",
        SimpleNamespace(name="mock_supabase"),
        raising=True,
    )

    placeholder = {"id": "abc123"}

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "store_photo_metadata",
        lambda data: dict(placeholder, **data),
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "supports_thumbnail_columns",
        lambda: True,
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_photo_metadata",
        lambda photo_id, updates: (_ for _ in ()).throw(RuntimeError("fail")),
        raising=True,
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "delete_photo_metadata",
        lambda photo_id: True,
        raising=True,
    )

    upload_keys = []

    monkeypatch.setattr(
        r2_module.r2_client,
        "upload_project_photo",
        lambda project_id, photo_id, file_bytes, ext, content_type=None: upload_keys.append(
            f"projects/{project_id}/photos/{photo_id}.{ext}"
        )
        or upload_keys[-1],
        raising=True,
    )
    monkeypatch.setattr(
        r2_module.r2_client,
        "upload_bytes",
        lambda data, key, content_type=None: upload_keys.append(key) or True,
        raising=True,
    )
    monkeypatch.setattr(
        r2_module.r2_client,
        "get_file_url",
        lambda key: f"https://cdn/{key}",
        raising=True,
    )
    deleted_keys = []
    monkeypatch.setattr(
        r2_module.r2_client,
        "delete_file",
        lambda key: deleted_keys.append(key),
        raising=True,
    )

    response = client.post(
        "/api/photos/upload",
        data={
            "file": (io.BytesIO(_make_image_bytes()), "one.jpg", "image/jpeg"),
            "user_id": "user-42",
            "latitude": "1.0",
            "longitude": "2.0",
            "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 500
    assert set(deleted_keys) == set(upload_keys)

