"""Tests for project plan upload (rasterization workflow, validation, stored dimensions)."""

import io

import pytest
from PIL import Image

import app.services.plan_service as plan_service_module
import app.services.storage.r2_client as r2_module
import app.services.storage.supabase_client as supabase_module
from app.routes.projects import PLAN_ADMIN_ROLES
from app.services.plan_rasterizer import RasterizeError, rasterize_to_png


AUTH_HEADER = {"Authorization": "Bearer valid-supabase-token"}
PROJECT_ID = "11111111-1111-1111-1111-111111111111"


def _make_png_bytes(width=100, height=200):
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(100, 100, 100))
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def stub_auth(monkeypatch):
    import app.middleware.auth_middleware as auth_middleware

    monkeypatch.setattr(
        auth_middleware,
        "verify_supabase_jwt",
        lambda token: {"id": "user-1"},
    )


@pytest.fixture
def app():
    from app import create_app, db

    flask_app = create_app()
    flask_app.config["TESTING"] = True
    flask_app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def mock_plan_deps(monkeypatch):
    """Mock require_role, plan_service, r2_client, supabase for plan uploads."""
    import app.services.auth.permissions as permissions_module

    def allow_admin(project_id, roles, user_id=None):
        if roles == PLAN_ADMIN_ROLES:
            return {"user_id": "user-1", "role": "Owner"}
        return {"user_id": "user-1", "role": "Viewer"}

    monkeypatch.setattr(permissions_module, "require_role", allow_admin)

    monkeypatch.setattr(
        plan_service_module,
        "get_plan_by_project_id",
        lambda project_id: None,
    )
    uploaded = {}

    def fake_upload(project_id, file_bytes, ext, content_type=None):
        uploaded["key"] = f"projects/{project_id}/plans/plan.{ext}"
        uploaded["bytes"] = file_bytes
        uploaded["content_type"] = content_type
        return uploaded["key"]

    monkeypatch.setattr(r2_module.r2_client, "client", object())
    monkeypatch.setattr(r2_module.r2_client, "upload_project_plan", fake_upload)
    monkeypatch.setattr(r2_module.r2_client, "delete_file", lambda key: None)
    monkeypatch.setattr(
        r2_module.r2_client,
        "generate_presigned_url",
        lambda key, expires_in=600: f"https://example.com/{key}",
    )

    stored = {}

    def fake_store(payload):
        stored["plan"] = payload
        return {**payload, "created_at": "2024-01-01T00:00:00Z", "updated_at": "2024-01-01T00:00:00Z"}

    def fake_update(project_id, **kwargs):
        stored["plan"] = {**stored.get("plan", {}), **kwargs}
        return stored["plan"]

    monkeypatch.setattr(supabase_module.supabase_client, "client", object())
    monkeypatch.setattr(supabase_module.supabase_client, "store_project_plan", fake_store)
    monkeypatch.setattr(supabase_module.supabase_client, "update_project_plan", fake_update)

    return {"uploaded": uploaded, "stored": stored}


def test_plan_upload_png_stores_rasterized_dimensions(client, mock_plan_deps):
    """POST plan with PNG stores image_width and image_height from rasterizer."""
    png = _make_png_bytes(100, 200)
    form = {
        "min_lat": "40.0",
        "min_lng": "-74.0",
        "max_lat": "40.1",
        "max_lng": "-73.9",
    }
    data = {"file": (io.BytesIO(png), "plan.png", "image/png")}
    resp = client.post(
        f"/api/v1/projects/{PROJECT_ID}/plan",
        data={**form, **data},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body.get("image_width") == 100
    assert body.get("image_height") == 200
    assert body.get("file_type") == "image/png"
    assert body.get("file_name") == "plan.png"
    stored = mock_plan_deps["stored"].get("plan")
    assert stored
    assert stored.get("image_width") == 100
    assert stored.get("image_height") == 200
    assert mock_plan_deps["uploaded"].get("key", "").endswith(".png")


def test_plan_upload_jpeg_normalizes_to_png(client, mock_plan_deps):
    """POST plan with JPEG stores PNG and dimensions."""
    buf = io.BytesIO()
    Image.new("RGB", (50, 75), color=(0, 0, 0)).save(buf, format="JPEG", quality=90)
    jpeg = buf.getvalue()
    form = {
        "min_lat": "40.0",
        "min_lng": "-74.0",
        "max_lat": "40.1",
        "max_lng": "-73.9",
    }
    data = {"file": (io.BytesIO(jpeg), "plan.jpg", "image/jpeg")}
    resp = client.post(
        f"/api/v1/projects/{PROJECT_ID}/plan",
        data={**form, **data},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body.get("file_type") == "image/png"
    assert body.get("image_width") == 50
    assert body.get("image_height") == 75
    assert mock_plan_deps["uploaded"].get("key", "").endswith(".png")


def test_plan_upload_failed_rasterization_returns_400_no_db_write(client, mock_plan_deps, monkeypatch):
    """Failed rasterization returns 400 and does not write to DB."""
    def fail_rasterize(*args, **kwargs):
        raise RasterizeError("Invalid or corrupted image")

    monkeypatch.setattr("app.routes.projects.rasterize_to_png", fail_rasterize)

    png = _make_png_bytes(5, 5)
    form = {
        "min_lat": "40.0",
        "min_lng": "-74.0",
        "max_lat": "40.1",
        "max_lng": "-73.9",
    }
    data = {"file": (io.BytesIO(png), "plan.png", "image/png")}
    resp = client.post(
        f"/api/v1/projects/{PROJECT_ID}/plan",
        data={**form, **data},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert body.get("error") == "invalid_file"
    assert "message" in body
    stored = mock_plan_deps["stored"].get("plan")
    assert not stored


def test_plan_upload_unsupported_format_rejected(client, mock_plan_deps):
    """Unsupported format (e.g. .gif) returns 400."""
    form = {
        "min_lat": "40.0",
        "min_lng": "-74.0",
        "max_lat": "40.1",
        "max_lng": "-73.9",
    }
    data = {"file": (io.BytesIO(b"fake"), "plan.gif", "image/gif")}
    resp = client.post(
        f"/api/v1/projects/{PROJECT_ID}/plan",
        data={**form, **data},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400
    body = resp.get_json()
    err = body.get("error", "")
    assert "invalid_metadata" in err or "invalid_file" in err


def test_plan_upload_pdf_converted_to_png_stores_dimensions(client, mock_plan_deps, monkeypatch):
    """POST plan with PDF stores rasterized PNG dimensions (mocked PDF conversion)."""
    png_out = _make_png_bytes(800, 600)

    def mock_rasterize(data, filename_hint="", mime_hint=""):
        if data[:4] == b"%PDF" or (filename_hint and "pdf" in filename_hint.lower()):
            return (png_out, 800, 600)
        return rasterize_to_png(data, filename_hint, mime_hint)

    monkeypatch.setattr("app.routes.projects.rasterize_to_png", mock_rasterize)

    form = {
        "min_lat": "40.0",
        "min_lng": "-74.0",
        "max_lat": "40.1",
        "max_lng": "-73.9",
    }
    data = {"file": (io.BytesIO(b"%PDF-1.4 fake"), "plan.pdf", "application/pdf")}
    resp = client.post(
        f"/api/v1/projects/{PROJECT_ID}/plan",
        data={**form, **data},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body.get("image_width") == 800
    assert body.get("image_height") == 600
    assert body.get("file_type") == "image/png"
    stored = mock_plan_deps["stored"].get("plan")
    assert stored
    assert stored.get("image_width") == 800
    assert stored.get("image_height") == 600
    assert mock_plan_deps["uploaded"].get("key", "").endswith(".png")


def test_plan_upload_stored_record_has_image_dimensions(client, mock_plan_deps):
    """Stored plan record contains valid image_width and image_height and PNG in R2."""
    png = _make_png_bytes(300, 400)
    form = {
        "min_lat": "40.0",
        "min_lng": "-74.0",
        "max_lat": "40.1",
        "max_lng": "-73.9",
    }
    data = {"file": (io.BytesIO(png), "plan.png", "image/png")}
    resp = client.post(
        f"/api/v1/projects/{PROJECT_ID}/plan",
        data={**form, **data},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    stored = mock_plan_deps["stored"].get("plan")
    assert stored is not None
    assert stored.get("image_width") == 300
    assert stored.get("image_height") == 400
    assert stored.get("file_type") == "image/png"
    assert stored.get("r2_path", "").endswith(".png")
    uploaded_bytes = mock_plan_deps["uploaded"].get("bytes", b"")
    assert uploaded_bytes[:8] == b"\x89PNG\r\n\x1a\n"
