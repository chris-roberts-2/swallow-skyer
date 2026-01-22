import io
import pytest
from types import SimpleNamespace
from PIL import Image


def _make_image_bytes():
    img = Image.new("RGB", (16, 16), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_batch_upload_multiple_files(client, auth_headers, monkeypatch):
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

    stored_calls = {
        "store": [],
        "update": [],
        "uploads": [],
    }

    def mock_store_photo_metadata(data):
        photo_id = f"photo-{len(stored_calls['store'])+1}"
        record = {"id": photo_id, **data}
        stored_calls["store"].append(record)
        return record

    def mock_update_photo_metadata(photo_id, updates):
        stored_calls["update"].append({"photo_id": photo_id, "updates": updates})
        return {"id": photo_id, **updates}

    def mock_upload_project_photo(project_id, photo_id, file_bytes, ext, content_type=None):
        stored_calls["uploads"].append(
            {
                "project_id": project_id,
                "photo_id": photo_id,
                "ext": ext,
                "content_type": content_type,
            }
        )
        return f"projects/{project_id}/photos/{photo_id}.{ext}"

    def mock_upload_bytes(data, key, content_type=None):
        stored_calls["uploads"].append({"thumbnail_key": key, "content_type": content_type})
        return True

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
        r2_module.r2_client,
        "get_file_url",
        lambda key: f"https://cdn.example/{key}",
        raising=True,
    )

    resp = client.post(
        "/api/photos/upload",
        data={
            "files": [
                (io.BytesIO(_make_image_bytes()), "one.jpg", "image/jpeg"),
                (io.BytesIO(_make_image_bytes()), "two.jpg", "image/jpeg"),
            ],
            "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        },
        headers=auth_headers,
        content_type="multipart/form-data",
    )

    assert resp.status_code == 201, resp.data
    payload = resp.get_json()
    assert payload["status"] == "success"
    assert len(payload["uploaded"]) == 2
    assert all(
        item["r2_path"].startswith(
            "projects/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/"
        )
        for item in payload["uploaded"]
    )
    assert stored_calls["uploads"], "expected uploads to be called"
    assert len(stored_calls["store"]) == 2
    assert (
        stored_calls["store"][0]["project_id"]
        == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    )
    assert stored_calls["store"][0]["original_filename"] == "one.jpg"
    assert len(stored_calls["update"]) == 2

